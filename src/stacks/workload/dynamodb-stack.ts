import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

export interface DynamoDBStackProps extends BaseStackProps {
  /**
   * Table names to create (e.g., ['core', 'savvue', 'equitrio'])
   */
  tables: string[];

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;

  /**
   * Enable deletion protection
   * @default true for prod, false for nprd
   */
  deletionProtection?: boolean;
}

/**
 * DynamoDB Stack for per-brand tables
 *
 * Creates DynamoDB tables with single-table design pattern:
 * - PK/SK for primary access
 * - GSI1 for secondary access patterns
 * - GSI2 for tertiary access patterns (e.g., email lookup)
 * - GSI3 for additional access patterns
 *
 * Tables use on-demand billing for cost efficiency at low scale.
 */
export class DynamoDBStack extends BaseStack {
  public readonly tables: Map<string, dynamodb.Table> = new Map();

  constructor(scope: Construct, id: string, props: DynamoDBStackProps) {
    super(scope, id, 'DynamoDB', props);

    const stackConfig = this.getStackConfig();
    const isProd = stackConfig.environment === 'prod';

    for (const tableName of props.tables) {
      const fullTableName = this.naming.resourceName(tableName);

      const table = new dynamodb.Table(this, `${tableName}Table`, {
        tableName: fullTableName,
        partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        pointInTimeRecovery: props.pointInTimeRecovery ?? true,
        deletionProtection: props.deletionProtection ?? isProd,
        removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });

      // GSI1 for access patterns like "get all items by type"
      table.addGlobalSecondaryIndex({
        indexName: 'GSI1',
        partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });

      // GSI2 for additional access patterns (e.g., email lookup, plaid ID lookup)
      table.addGlobalSecondaryIndex({
        indexName: 'GSI2',
        partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });

      // GSI3 for additional access patterns (e.g., account lookup for transactions)
      table.addGlobalSecondaryIndex({
        indexName: 'GSI3',
        partitionKey: { name: 'GSI3PK', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'GSI3SK', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });

      // GSI4 for inbox segment queries (e.g., transactions by inboxSegment)
      table.addGlobalSecondaryIndex({
        indexName: 'GSI4',
        partitionKey: { name: 'GSI4PK', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'GSI4SK', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });

      this.tables.set(tableName, table);

      // Export table name to SSM
      new ssm.StringParameter(this, `${tableName}TableNameParam`, {
        parameterName: this.naming.ssmParameterName('dynamodb', `${tableName}-table-name`),
        stringValue: fullTableName,
        description: `DynamoDB table name for ${tableName}`,
      });

      // Export table ARN to SSM
      new ssm.StringParameter(this, `${tableName}TableArnParam`, {
        parameterName: this.naming.ssmParameterName('dynamodb', `${tableName}-table-arn`),
        stringValue: table.tableArn,
        description: `DynamoDB table ARN for ${tableName}`,
      });

      // CloudFormation outputs
      new cdk.CfnOutput(this, `${tableName}TableNameOutput`, {
        value: fullTableName,
        description: `DynamoDB table name for ${tableName}`,
        exportName: `${this.stackName}-${tableName}-table-name`,
      });
    }
  }
}
