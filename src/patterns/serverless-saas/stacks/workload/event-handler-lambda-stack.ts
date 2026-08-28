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
 * Event Handlers:
 * - auto-matcher-handler-savvue: Handles transaction.categorized events (Savvue only)
 * - post-sync-handler-savvue:    Handles plaid.sync.completed events via SQS FIFO
 *                                (Savvue only — runs balance snapshots, suggestion
 *                                application, recurring + investment txn sync)
 *
 * Note: upgrade-handler, trial-expiry, and tier-changed handlers were removed.
 * Tier is now read from JWT only - webapp refreshes token after subscription changes.
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
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../../../../stacks/base';

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

  /**
   * Additional environment variables merged into every handler Lambda
   * created for this brand. Used to pass brand-scoped runtime config
   * (e.g. `PLAID_SECRET_PREFIX`) that the post-sync handler reads when
   * calling Plaid via the savvue-api services.
   */
  extraEnvironment?: Record<string, string>;
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

  /**
   * Optional KMS key for Plaid `providerAccessToken` envelope
   * encryption (P12 / FW-1). When provided, only the `savvue` brand
   * role is granted `kms:Decrypt` (post-sync-handler-savvue is the
   * sole consumer; it never writes tokens) and
   * `PLAID_TOKEN_KMS_KEY_ID` is injected into that brand's environment.
   */
  plaidTokenKey?: kms.IKey;

  /**
   * Per-handler ECR repository names, keyed by handler name.
   *
   * When provided, each handler imports its own ECR repository instead of
   * the legacy single `{brand}-event-handlers` repo. The handler name keys
   * are the un-prefixed Lambda names (the same string passed as
   * `cmd: ['{handlerName}.handler']`).
   *
   * Example for savvue:
   * ```ts
   * handlerEcrRepositories: {
   *   'auto-matcher-handler-savvue': 'savvue-auto-matcher',
   *   'post-sync-handler-savvue':    'savvue-post-sync',
   * }
   * ```
   *
   * The values are passed through `naming.resourceName(...)` so they should
   * be the un-prefixed service name (e.g. `savvue-auto-matcher`, not
   * `saas-nprd-savvue-auto-matcher`).
   *
   * If omitted, the stack falls back to the legacy single-repo lookup
   * (`{brand}-event-handlers`).
   */
  handlerEcrRepositories?: Record<string, string>;
}

/**
 * Event Handler Lambda Stack
 *
 * Creates Lambda functions for EventBridge event handlers with:
 * - Read/write access to brand's DynamoDB table
 * - CloudWatch Logs permissions
 * - SSM parameters for EventBridge rule integration
 *
 * Currently only creates:
 * - auto-matcher-handler-savvue: Handles transaction.categorized events
 *
 * Note: upgrade-handler, trial-expiry, and tier-changed handlers were removed.
 * Tier is now read from JWT only - webapp refreshes token after subscription changes.
 */
export class EventHandlerLambdaStack extends BaseStack {
  /**
   * Map of handler name to Lambda function
   * Keys: 'upgrade-handler-{brand}', 'trial-expiry-{brand}', etc.
   */
  public readonly functions: Map<string, lambda.Function> = new Map();

  constructor(scope: Construct, id: string, props: EventHandlerLambdaStackProps) {
    super(scope, id, 'EventHandlerLambda', props);

    const { handlers, dynamodbTables, eventBridgeBusName, plaidTokenKey } = props;
    const stackConfig = this.getStackConfig();

    const { handlerEcrRepositories } = props;

    // Create Lambda functions for each brand
    for (const handler of handlers) {
      const {
        brand,
        memorySize = 1024,
        timeout = 30,
        imageTag = 'latest',
        extraEnvironment,
      } = handler;

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

      // Build environment variables for event handlers
      const environment: Record<string, string> = {
        NODE_ENV: 'production',
        DYNAMODB_TABLE_NAME: brandTable.tableName,
      };

      // Add EventBridge bus name if configured
      if (eventBridgeBusName) {
        environment.EVENTBRIDGE_BUS_NAME = eventBridgeBusName;
      }

      // Merge per-brand extras (e.g. PLAID_SECRET_PREFIX for post-sync)
      if (extraEnvironment) {
        Object.assign(environment, extraEnvironment);
      }

      // Plaid token envelope encryption (P12). Only post-sync-handler-savvue
      // reads tokens; grant Decrypt-only on the savvue brand role and inject
      // the env var so `decryptToken` activates at runtime.
      if (plaidTokenKey && brand === 'savvue') {
        plaidTokenKey.grantDecrypt(executionRole);
        environment.PLAID_TOKEN_KMS_KEY_ID = plaidTokenKey.keyArn;
      }

      // Create auto-matcher handler (Savvue-specific only)
      // Handles transaction.categorized events to create suggestions for similar transactions
      // Note: upgrade-handler and trial-expiry were removed - tier is read from JWT only
      if (brand === 'savvue') {
        const autoMatcherEcr = this.resolveHandlerEcr(
          brand,
          `auto-matcher-handler-${brand}`,
          handlerEcrRepositories,
        );
        autoMatcherEcr.grantPull(executionRole);
        this.createEventHandler(
          `auto-matcher-handler-${brand}`,
          brand,
          autoMatcherEcr,
          executionRole,
          environment,
          memorySize,
          timeout,
          imageTag,
        );

        // Post-sync handler runs balance snapshots, suggestion application,
        // recurring + investment transaction sync after a Plaid webhook.
        // Triggered via SQS FIFO from EventBridge (`plaid.sync.completed`).
        const postSyncEcr = this.resolveHandlerEcr(
          brand,
          `post-sync-handler-${brand}`,
          handlerEcrRepositories,
        );
        postSyncEcr.grantPull(executionRole);
        this.createEventHandler(
          `post-sync-handler-${brand}`,
          brand,
          postSyncEcr,
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
   * Resolve which ECR repository a given handler imports its image from.
   *
   * Prefers the per-handler entry from `handlerEcrRepositories` when
   * provided; falls back to the legacy `{brand}-event-handlers` shared
   * repo so existing consumers keep working without changes.
   */
  private resolveHandlerEcr(
    brand: string,
    handlerName: string,
    handlerEcrRepositories?: Record<string, string>,
  ): ecr.IRepository {
    const customServiceName = handlerEcrRepositories?.[handlerName];
    if (customServiceName) {
      return ecr.Repository.fromRepositoryName(
        this,
        `${handlerName}EcrRepo`,
        this.naming.resourceName(customServiceName),
      );
    }
    // Legacy fallback: one shared `{brand}-event-handlers` repo for all handlers.
    // Memoize so multiple handlers in the same brand share the construct.
    const legacyId = `${brand}EventHandlersEcrRepo`;
    const existing = this.node.tryFindChild(legacyId) as ecr.IRepository | undefined;
    if (existing) return existing;
    return ecr.Repository.fromRepositoryName(
      this,
      legacyId,
      this.naming.resourceName(`${brand}-event-handlers`),
    );
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

    // Secrets Manager read access scoped to the brand's project namespace.
    // Required by post-sync-handler-savvue, which calls Plaid via the
    // shared savvue-api services and resolves credentials at runtime.
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: [
          `arn:aws:secretsmanager:${stackConfig.region}:${stackConfig.accountId}:secret:*`,
        ],
      }),
    );

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
