/**
 * Lambda Function Stack for Workload Infrastructure
 *
 * Creates Lambda functions from ECR images for API services.
 * Lambda functions use DynamoDB for data storage with IAM-based access.
 *
 * Architecture:
 * - Lambda functions deployed without VPC (faster cold starts, direct AWS service access)
 * - IAM roles grant access to DynamoDB tables
 * - Each function gets DYNAMODB_TABLE_NAME for its own table (derived from function name)
 * - Function name 'api-savvue' → table 'savvue' → DYNAMODB_TABLE_NAME=saas-nprd-savvue
 * - SSM parameters for API Gateway integration
 *
 * @example
 * ```typescript
 * new LambdaFunctionStack(app, 'Lambda', {
 *   stackConfig: {
 *     project: 'SaaS',
 *     environment: 'nprd',
 *     region: 'us-east-1',
 *     accountId: '466279485605',
 *     owner: 'CodeIQLabs',
 *     company: 'CodeIQLabs',
 *   },
 *   config: {
 *     functions: [
 *       { name: 'api-core', memorySize: 1024, timeout: 30 },
 *       { name: 'api-savvue', memorySize: 1024, timeout: 30 },
 *     ],
 *   },
 *   dynamodbTables: dynamodbStack.tables,
 * });
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Lambda function configuration
 */
export interface LambdaFunctionConfig {
  /**
   * Function name (e.g., 'api-core', 'api-savvue')
   * Used for resource naming: saas-{env}-{name}
   */
  name: string;

  /**
   * Memory size in MB
   * More memory = more CPU = faster cold starts
   * @default 1024
   */
  memorySize?: number;

  /**
   * Timeout in seconds
   * @default 30
   */
  timeout?: number;

  /**
   * Reserved concurrent executions
   * Set to 0 to disable the function
   * @default undefined (no limit)
   */
  reservedConcurrentExecutions?: number;

  /**
   * Additional environment variables
   */
  environment?: Record<string, string>;

  /**
   * ECR repository name override
   * @default name (e.g., 'api-core')
   */
  ecrRepositoryName?: string;

  /**
   * ECR image tag
   * @default 'latest'
   */
  imageTag?: string;
}

/**
 * Lambda stack configuration
 */
export interface LambdaStackConfig {
  /**
   * Lambda functions to create
   */
  functions: LambdaFunctionConfig[];

  /**
   * EventBridge bus name for event publishing
   * @default undefined (no EventBridge access)
   */
  eventBridgeBusName?: string;
}

export interface LambdaFunctionStackProps extends BaseStackProps {
  /**
   * Lambda configuration from manifest
   */
  config: LambdaStackConfig;

  /**
   * DynamoDB tables for data access.
   * Map of table name (e.g., 'core', 'savvue') to Table construct.
   * Each Lambda function gets DYNAMODB_TABLE_NAME for its own table,
   * derived from function name (e.g., 'api-savvue' → 'savvue' table).
   * IAM role grants read/write access to all tables.
   */
  dynamodbTables?: Map<string, dynamodb.Table>;
}

/**
 * Lambda Function Stack for API services
 *
 * Creates Lambda functions from ECR images with DynamoDB access.
 * No VPC required - Lambda functions run outside VPC for faster cold starts.
 */
export class LambdaFunctionStack extends BaseStack {
  public readonly functions: Map<string, lambda.Function> = new Map();

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id, 'Lambda', props);

    const { config, dynamodbTables } = props;
    const stackConfig = this.getStackConfig();

    // Create Lambda execution role with necessary permissions
    const executionRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: this.naming.resourceName('lambda-execution-role'),
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        // Basic execution role for CloudWatch Logs
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant DynamoDB access to all tables
    if (dynamodbTables) {
      for (const [, table] of dynamodbTables) {
        table.grantReadWriteData(executionRole);
      }
    }

    // Grant access to Secrets Manager
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: [
          `arn:aws:secretsmanager:${stackConfig.region}:${stackConfig.accountId}:secret:*`,
        ],
      }),
    );

    // Grant access to EventBridge if configured
    if (config.eventBridgeBusName) {
      executionRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['events:PutEvents'],
          resources: [
            `arn:aws:events:${stackConfig.region}:${stackConfig.accountId}:event-bus/${config.eventBridgeBusName}`,
          ],
        }),
      );
    }

    // Create Lambda functions
    for (const fnConfig of config.functions) {
      const functionName = this.naming.resourceName(fnConfig.name);
      const ecrRepoName = fnConfig.ecrRepositoryName ?? fnConfig.name;

      // Import ECR repository
      const ecrRepository = ecr.Repository.fromRepositoryName(
        this,
        `${fnConfig.name}EcrRepo`,
        this.naming.resourceName(ecrRepoName),
      );

      // Grant ECR pull permissions to the execution role
      // This is required for Lambda to pull the container image from ECR
      ecrRepository.grantPull(executionRole);

      // Derive table name from function name (e.g., 'api-savvue' → 'savvue', 'api-core' → 'core')
      // Each Lambda function connects to its own single table
      const derivedTableName = fnConfig.name.replace(/^api-/, '');

      // Build environment variables
      // Note: AWS_REGION is automatically set by Lambda runtime, don't set it manually
      const environment: Record<string, string> = {
        NODE_ENV: 'production',
        ...fnConfig.environment,
      };

      // Set DYNAMODB_TABLE_NAME for this function's specific table
      if (dynamodbTables) {
        const table = dynamodbTables.get(derivedTableName);
        if (table) {
          environment.DYNAMODB_TABLE_NAME = table.tableName;
        }
      }

      // Add EventBridge bus name if configured
      if (config.eventBridgeBusName) {
        environment.EVENTBRIDGE_BUS_NAME = config.eventBridgeBusName;
      }

      // Create Lambda function from ECR image (no VPC for faster cold starts)
      const fn = new lambda.DockerImageFunction(this, `${fnConfig.name}Function`, {
        functionName,
        code: lambda.DockerImageCode.fromEcr(ecrRepository, {
          tagOrDigest: fnConfig.imageTag ?? 'latest',
          cmd: ['lambda.handler'],
        }),
        memorySize: fnConfig.memorySize ?? 1024,
        timeout: cdk.Duration.seconds(fnConfig.timeout ?? 30),
        role: executionRole,
        environment,
        reservedConcurrentExecutions: fnConfig.reservedConcurrentExecutions,
        tracing: lambda.Tracing.ACTIVE,
      });

      this.functions.set(fnConfig.name, fn);

      // Store function ARN in SSM for API Gateway integration
      new ssm.StringParameter(this, `${fnConfig.name}ArnParameter`, {
        parameterName: this.naming.ssmParameterName('lambda', `${fnConfig.name}-arn`),
        stringValue: fn.functionArn,
        description: `Lambda function ARN for ${fnConfig.name}`,
      });

      // Output function ARN
      new cdk.CfnOutput(this, `${fnConfig.name}FunctionArn`, {
        value: fn.functionArn,
        exportName: this.naming.exportName(`lambda-${fnConfig.name}-arn`),
        description: `Lambda function ARN for ${fnConfig.name}`,
      });
    }
  }
}
