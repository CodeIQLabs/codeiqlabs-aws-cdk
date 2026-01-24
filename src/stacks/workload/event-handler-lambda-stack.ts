/**
 * Event Handler Lambda Stack for Workload Infrastructure
 *
 * Creates Lambda functions from ECR images for EventBridge event handlers.
 * Event handlers process subscription events and update brand-specific DynamoDB tables.
 *
 * Architecture:
 * - Lambda functions deployed without VPC (faster cold starts, direct AWS service access)
 * - IAM roles grant read/write access to brand's DynamoDB table
 * - SSM parameters for EventBridge rule integration
 *
 * Event Handlers per brand:
 * - tier-changed-{brand}: Handles subscription.tier.changed events
 * - upgrade-handler-{brand}: Handles subscription.upgraded events
 * - trial-expiry-{brand}: Handles subscription.trial.expired events
 *
 * @example
 * ```typescript
 * new EventHandlerLambdaStack(app, 'EventHandlerLambda', {
 *   stackConfig: {
 *     project: 'SaaS',
 *     environment: 'nprd',
 *     region: 'us-east-1',
 *     accountId: '466279485605',
 *     owner: 'CodeIQLabs',
 *     company: 'CodeIQLabs',
 *   },
 *   handlers: [
 *     { brand: 'savvue', memorySize: 1024, timeout: 30 },
 *     { brand: 'equitrio', memorySize: 1024, timeout: 30 },
 *   ],
 *   dynamodbTables: dynamodbStack.tables,
 *   eventBridgeBusName: 'saas-nprd-events',
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
 * Event handler configuration for a brand
 */
export interface EventHandlerConfig {
  /**
   * Brand name (e.g., 'savvue', 'equitrio')
   * Used for resource naming and DynamoDB table access
   */
  brand: string;

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
   * ECR image tag
   * @default 'latest'
   */
  imageTag?: string;
}

/**
 * Props for EventHandlerLambdaStack
 */
export interface EventHandlerLambdaStackProps extends BaseStackProps {
  /**
   * Event handler configurations (one per brand)
   */
  handlers: EventHandlerConfig[];

  /**
   * DynamoDB tables for data access.
   * Map of table name (e.g., 'savvue', 'equitrio') to Table construct.
   * Each event handler gets:
   * - DYNAMODB_TABLE_NAME: Brand's table for read/write
   */
  dynamodbTables: Map<string, dynamodb.Table>;

  /**
   * EventBridge bus name for event publishing (if handlers need to publish events)
   * @default undefined (no EventBridge publish access)
   */
  eventBridgeBusName?: string;
}

/**
 * Event Handler Lambda Stack
 *
 * Creates Lambda functions for EventBridge event handlers with:
 * - Read/write access to brand's DynamoDB table
 * - CloudWatch Logs permissions
 * - SSM parameters for EventBridge rule integration
 *
 * Creates three Lambda functions per brand:
 * - tier-changed-{brand}: Handles subscription.tier.changed events
 * - upgrade-handler-{brand}: Handles subscription.upgraded events
 * - trial-expiry-{brand}: Handles subscription.trial.expired events
 */
export class EventHandlerLambdaStack extends BaseStack {
  /**
   * Map of handler name to Lambda function
   * Keys: 'tier-changed-{brand}', 'upgrade-handler-{brand}'
   */
  public readonly functions: Map<string, lambda.Function> = new Map();

  constructor(scope: Construct, id: string, props: EventHandlerLambdaStackProps) {
    super(scope, id, 'EventHandlerLambda', props);

    const { handlers, dynamodbTables, eventBridgeBusName } = props;
    const stackConfig = this.getStackConfig();

    // Create Lambda functions for each brand
    for (const handler of handlers) {
      const { brand, memorySize = 1024, timeout = 30, imageTag = 'latest' } = handler;

      // Get brand's DynamoDB table
      const brandTable = dynamodbTables.get(brand);
      if (!brandTable) {
        throw new Error(`EventHandlerLambdaStack: DynamoDB table for brand '${brand}' not found`);
      }

      // Create execution role for this brand's handlers
      // Each brand gets its own role to ensure IAM isolation
      const executionRole = this.createExecutionRole(
        brand,
        brandTable,
        stackConfig,
        eventBridgeBusName,
      );

      // Import ECR repository for event handlers
      const ecrRepository = ecr.Repository.fromRepositoryName(
        this,
        `${brand}EventHandlersEcrRepo`,
        this.naming.resourceName(`${brand}-event-handlers`),
      );

      // Grant ECR pull permissions to the execution role
      ecrRepository.grantPull(executionRole);

      // Build environment variables for event handlers
      const environment: Record<string, string> = {
        NODE_ENV: 'production',
        DYNAMODB_TABLE_NAME: brandTable.tableName,
      };

      // Add EventBridge bus name if configured
      if (eventBridgeBusName) {
        environment.EVENTBRIDGE_BUS_NAME = eventBridgeBusName;
      }

      // Create tier-changed handler
      this.createEventHandler(
        `tier-changed-${brand}`,
        brand,
        ecrRepository,
        executionRole,
        environment,
        memorySize,
        timeout,
        imageTag,
      );

      // Create upgrade-handler
      this.createEventHandler(
        `upgrade-handler-${brand}`,
        brand,
        ecrRepository,
        executionRole,
        environment,
        memorySize,
        timeout,
        imageTag,
      );

      // Create trial-expiry handler
      this.createEventHandler(
        `trial-expiry-${brand}`,
        brand,
        ecrRepository,
        executionRole,
        environment,
        memorySize,
        timeout,
        imageTag,
      );

      // Create auto-matcher handler (Savvue-specific)
      // Handles transaction.categorized events to create suggestions for similar transactions
      if (brand === 'savvue') {
        this.createEventHandler(
          `auto-matcher-handler-${brand}`,
          brand,
          ecrRepository,
          executionRole,
          environment,
          memorySize,
          timeout,
          imageTag,
        );
      }
    }
  }

  /**
   * Create an IAM execution role for a brand's event handlers
   *
   * Grants:
   * - Read/write access to brand's DynamoDB table
   * - CloudWatch Logs permissions
   * - EventBridge publish permissions (if configured)
   */
  private createExecutionRole(
    brand: string,
    brandTable: dynamodb.Table,
    stackConfig: ReturnType<typeof this.getStackConfig>,
    eventBridgeBusName?: string,
  ): iam.Role {
    const executionRole = new iam.Role(this, `${brand}EventHandlerExecutionRole`, {
      roleName: this.naming.resourceName(`${brand}-event-handler-role`),
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        // Basic execution role for CloudWatch Logs
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant read/write access to brand's DynamoDB table
    brandTable.grantReadWriteData(executionRole);

    // Grant access to EventBridge if configured
    if (eventBridgeBusName) {
      executionRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['events:PutEvents'],
          resources: [
            `arn:aws:events:${stackConfig.region}:${stackConfig.accountId}:event-bus/${eventBridgeBusName}`,
          ],
        }),
      );
    }

    return executionRole;
  }

  /**
   * Create an event handler Lambda function
   */
  private createEventHandler(
    handlerName: string,
    _brand: string,
    ecrRepository: ecr.IRepository,
    executionRole: iam.Role,
    environment: Record<string, string>,
    memorySize: number,
    timeout: number,
    imageTag: string,
  ): void {
    const functionName = this.naming.resourceName(handlerName);

    // Create Lambda function from ECR image (no VPC for faster cold starts)
    const fn = new lambda.DockerImageFunction(this, `${handlerName}Function`, {
      functionName,
      code: lambda.DockerImageCode.fromEcr(ecrRepository, {
        tagOrDigest: imageTag,
        cmd: [`${handlerName}.handler`],
      }),
      memorySize,
      timeout: cdk.Duration.seconds(timeout),
      role: executionRole,
      environment,
      tracing: lambda.Tracing.ACTIVE,
    });

    this.functions.set(handlerName, fn);

    // Store function ARN in SSM for EventBridge rule integration
    // Path: /codeiqlabs/saas/{env}/lambda/{handler-name}-arn
    new ssm.StringParameter(this, `${handlerName}ArnParameter`, {
      parameterName: this.naming.ssmParameterName('lambda', `${handlerName}-arn`),
      stringValue: fn.functionArn,
      description: `Lambda function ARN for ${handlerName}`,
    });

    // Output function ARN
    new cdk.CfnOutput(this, `${handlerName}FunctionArn`, {
      value: fn.functionArn,
      exportName: this.naming.exportName(`lambda-${handlerName}-arn`),
      description: `Lambda function ARN for ${handlerName}`,
    });
  }
}
