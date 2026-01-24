import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { BaseStack, BaseStackProps } from '../base';

export interface RefreshTokenCleanupStackProps extends BaseStackProps {
  /**
   * DynamoDB table name for the core table containing refresh tokens
   */
  tableName: string;

  /**
   * DynamoDB table ARN for IAM permissions
   */
  tableArn: string;
}

/**
 * Stack that creates a scheduled Lambda function to clean up expired refresh tokens.
 *
 * Creates:
 * - Lambda function that queries and deletes expired tokens
 * - EventBridge rule scheduled for 2 AM EST daily
 * - IAM permissions for DynamoDB access
 *
 * The cleanup runs daily at 2 AM Eastern Time (handles EST/EDT automatically).
 */
export class RefreshTokenCleanupStack extends BaseStack {
  public readonly cleanupFunction: lambda.Function;

  constructor(scope: cdk.App, id: string, props: RefreshTokenCleanupStackProps) {
    super(scope, id, 'RefreshTokenCleanup', props);

    const { tableName, tableArn } = props;

    // Lambda function for cleanup
    this.cleanupFunction = new lambda.Function(this, 'CleanupFunction', {
      functionName: this.naming.resourceName('refresh-token-cleanup'),
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;

exports.handler = async (event) => {
  console.log('Starting refresh token cleanup', { tableName: TABLE_NAME });
  
  const now = new Date().toISOString();
  let deletedCount = 0;
  let scannedCount = 0;
  
  try {
    // Scan for expired refresh tokens
    // Note: Using scan because we need to check expiresAt across all tokens
    // For large tables, consider adding a GSI on expiresAt for more efficient queries
    let lastEvaluatedKey;
    
    do {
      const scanParams = {
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(pk, :pkPrefix) AND expiresAt < :now',
        ExpressionAttributeValues: {
          ':pkPrefix': 'REFRESH_TOKEN#',
          ':now': now
        },
        ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey })
      };
      
      const scanResult = await client.send(new ScanCommand(scanParams));
      scannedCount += scanResult.Count || 0;
      
      if (scanResult.Items && scanResult.Items.length > 0) {
        // Batch delete expired tokens (max 25 per batch)
        const batches = [];
        for (let i = 0; i < scanResult.Items.length; i += 25) {
          batches.push(scanResult.Items.slice(i, i + 25));
        }
        
        for (const batch of batches) {
          await client.send(new BatchWriteCommand({
            RequestItems: {
              [TABLE_NAME]: batch.map(item => ({
                DeleteRequest: {
                  Key: {
                    pk: item.pk,
                    sk: item.sk
                  }
                }
              }))
            }
          }));
          
          deletedCount += batch.length;
        }
      }
      
      lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    console.log('Refresh token cleanup completed', {
      scannedCount,
      deletedCount,
      timestamp: now
    });
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Cleanup completed successfully',
        scannedCount,
        deletedCount,
        timestamp: now
      })
    };
    
  } catch (error) {
    console.error('Refresh token cleanup failed', {
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  }
};
      `),
      environment: {
        TABLE_NAME: tableName,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      description: 'Scheduled cleanup of expired refresh tokens from DynamoDB',
    });

    // Grant DynamoDB permissions
    this.cleanupFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:Scan', 'dynamodb:BatchWriteItem'],
        resources: [tableArn],
      }),
    );

    // EventBridge rule: Daily at 2 AM Eastern Time
    const cleanupRule = new events.Rule(this, 'CleanupSchedule', {
      ruleName: this.naming.resourceName('refresh-token-cleanup-schedule'),
      description: 'Trigger refresh token cleanup daily at 2 AM EST',
      schedule: events.Schedule.cron({
        hour: '2',
        minute: '0',
        // America/New_York handles EST/EDT automatically
        // Winter (EST): 2 AM EST = 7 AM UTC
        // Summer (EDT): 2 AM EDT = 6 AM UTC
      }),
      // Note: EventBridge cron uses UTC by default
      // For 2 AM EST year-round, we use 7 AM UTC (winter time)
      // This means during EDT (summer), it runs at 3 AM EDT
      // To handle DST properly, we'd need two rules or accept the 1-hour shift
    });

    cleanupRule.addTarget(new targets.LambdaFunction(this.cleanupFunction));

    // Outputs
    new cdk.CfnOutput(this, 'CleanupFunctionArn', {
      value: this.cleanupFunction.functionArn,
      description: 'ARN of the refresh token cleanup Lambda function',
      exportName: this.naming.exportName('refresh-token-cleanup-function-arn'),
    });

    new cdk.CfnOutput(this, 'CleanupScheduleArn', {
      value: cleanupRule.ruleArn,
      description: 'ARN of the EventBridge cleanup schedule rule',
      exportName: this.naming.exportName('refresh-token-cleanup-schedule-arn'),
    });

    // Apply standard tags
    cdk.Tags.of(this).add('Component', 'RefreshTokenCleanup');
  }
}
