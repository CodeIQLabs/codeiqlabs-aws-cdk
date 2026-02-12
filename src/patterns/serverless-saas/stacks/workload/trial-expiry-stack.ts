import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { BaseStack, BaseStackProps } from '../../../../stacks/base';

export interface BrandTableConfig {
  /**
   * Brand name (e.g., 'savvue', 'equitrio')
   */
  brand: string;

  /**
   * DynamoDB table name for the brand
   */
  tableName: string;

  /**
   * DynamoDB table ARN for the brand
   */
  tableArn: string;
}

export interface TrialExpiryStackProps extends BaseStackProps {
  /**
   * DynamoDB table name for the core table containing subscriptions
   */
  coreTableName: string;

  /**
   * DynamoDB table ARN for IAM permissions on core table
   */
  coreTableArn: string;

  /**
   * Brand table configurations for connection queries
   */
  brandTables: BrandTableConfig[];
}

/**
 * Stack that creates a scheduled Lambda function to expire trials and disconnect
 * non-primary Plaid connections.
 *
 * Uses DockerImageFunction from ECR (core-jobs repository) instead of inline code
 * to avoid the CloudFormation ZipFile 4096-char limit.
 *
 * Creates:
 * - DockerImageFunction referencing core-jobs ECR repository
 * - EventBridge rule scheduled daily at 00:00 UTC
 * - IAM permissions for DynamoDB, Secrets Manager, and ECR access
 *
 * Trial expiry logic:
 * 1. Query GSI2 on core table for trialExpired=false AND trialEndsAt < now
 * 2. Skip any with planStatus='active' (paid subscribers who had a trial)
 * 3. Update subscription: plan='free', planStatus=null, trialExpired=true
 * 4. For each user's connections in brand tables:
 *    - Non-primary connections: Call Plaid /item/remove
 *    - Primary connection: Remove webhooks via /item/webhook/update
 */
export class TrialExpiryStack extends BaseStack {
  public readonly expiryFunction: lambda.DockerImageFunction;

  constructor(scope: cdk.App, id: string, props: TrialExpiryStackProps) {
    super(scope, id, 'TrialExpiry', props);

    const { coreTableName, coreTableArn, brandTables } = props;

    // Build brand table map for Lambda environment
    const brandTableMap: Record<string, string> = {};
    for (const bt of brandTables) {
      brandTableMap[bt.brand] = bt.tableName;
    }

    // Look up the core-jobs ECR repo (created by EcrRepositoryStack)
    const ecrRepository = ecr.Repository.fromRepositoryName(
      this,
      'CoreJobsEcrRepo',
      this.naming.resourceName('core-jobs'),
    );

    // DockerImageFunction referencing ECR image
    this.expiryFunction = new lambda.DockerImageFunction(this, 'ExpiryFunction', {
      functionName: this.naming.resourceName('trial-expiry-checker'),
      code: lambda.DockerImageCode.fromEcr(ecrRepository, {
        tagOrDigest: 'latest',
        cmd: ['trial-expiry-checker.handler'],
      }),
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      reservedConcurrentExecutions: 1,
      environment: {
        CORE_TABLE: coreTableName,
        BRAND_TABLES: JSON.stringify(brandTableMap),
        PLAID_SECRET_PREFIX: `${props.stackConfig.project}/${props.stackConfig.environment}`,
      },
      description:
        'Daily trial expiry checker — expires trials and disconnects extra Plaid connections',
    });

    // Grant ECR pull access
    ecrRepository.grantPull(this.expiryFunction);

    // Grant DynamoDB permissions on core table
    this.expiryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:Query', 'dynamodb:UpdateItem'],
        resources: [coreTableArn, `${coreTableArn}/index/*`],
      }),
    );

    // Grant DynamoDB permissions on brand tables
    for (const bt of brandTables) {
      this.expiryFunction.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:Query', 'dynamodb:UpdateItem'],
          resources: [bt.tableArn, `${bt.tableArn}/index/*`],
        }),
      );
    }

    // Grant Secrets Manager access for Plaid credentials
    this.expiryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: [
          `arn:aws:secretsmanager:${props.stackConfig.region}:${props.stackConfig.accountId}:secret:*`,
        ],
      }),
    );

    // EventBridge rule: Daily at midnight UTC
    const expiryRule = new events.Rule(this, 'ExpirySchedule', {
      ruleName: this.naming.resourceName('trial-expiry-schedule'),
      description: 'Trigger trial expiry check daily at midnight UTC',
      schedule: events.Schedule.cron({
        hour: '0',
        minute: '0',
      }),
    });

    expiryRule.addTarget(new targets.LambdaFunction(this.expiryFunction));

    // Outputs
    new cdk.CfnOutput(this, 'ExpiryFunctionArn', {
      value: this.expiryFunction.functionArn,
      description: 'ARN of the trial expiry checker Lambda function',
      exportName: this.naming.exportName('trial-expiry-function-arn'),
    });

    new cdk.CfnOutput(this, 'ExpiryScheduleArn', {
      value: expiryRule.ruleArn,
      description: 'ARN of the EventBridge trial expiry schedule rule',
      exportName: this.naming.exportName('trial-expiry-schedule-arn'),
    });

    // Apply standard tags
    cdk.Tags.of(this).add('Component', 'TrialExpiry');
  }
}
