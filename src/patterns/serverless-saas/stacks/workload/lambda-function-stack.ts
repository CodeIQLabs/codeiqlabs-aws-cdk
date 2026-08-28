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
 * - Function name 'savvue-api' → table 'savvue' → DYNAMODB_TABLE_NAME=saas-nprd-savvue
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
 *       { name: 'core-api', memorySize: 1024, timeout: 30 },
 *       { name: 'savvue-api', memorySize: 1024, timeout: 30 },
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
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubs from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../../../../stacks/base';

/**
 * Lambda function configuration
 */
export interface LambdaFunctionConfig {
  /**
   * Function name (e.g., 'core-api', 'savvue-api')
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
   * @default name (e.g., 'core-api')
   */
  ecrRepositoryName?: string;

  /**
   * ECR image tag
   * @default 'latest'
   */
  imageTag?: string;

  /**
   * Orphaned Plaid item alarm. When set, the stack creates a CloudWatch
   * MetricFilter on this function's log group for the literal log marker
   * `plaid_item_remove_failed_orphan`, paired with an Alarm (>=1 occurrence
   * in any 5-minute window) wired to a per-function SNS topic with the
   * given email subscriber. See Gap-11 in the stripe-integration-spec.
   */
  orphanPlaidItemAlarm?: {
    /** Email address subscribed to the SNS topic for orphan-item alerts. */
    opsEmail: string;
  };

  /**
   * Unknown Stripe price-id alarm. When set, the stack creates a CloudWatch
   * MetricFilter on this function's log group for the literal substring
   * `unknown_priceId_in_` (matches the three emit sites in core-api:
   * `unknown_priceId_in_billing_subscription`,
   * `unknown_priceId_in_checkout_session_completed`,
   * `unknown_priceId_in_subscription_updated`), paired with an Alarm
   * (>=1 occurrence in any 5-minute window) wired to a per-function SNS
   * topic with the given email subscriber. Indicates env-var / manifest
   * drift — a Stripe price flowed through that the Lambda's
   * `getPlanFromPriceId` doesn't recognize. See cross-cutting PX.1 in the
   * stripe-integration-spec.
   */
  unknownPriceIdAlarm?: {
    /** Email address subscribed to the SNS topic for unknown-priceId alerts. */
    opsEmail: string;
  };
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
   * derived from function name (e.g., 'savvue-api' → 'savvue' table).
   * IAM role grants read/write access to all tables.
   */
  dynamodbTables?: Map<string, dynamodb.Table>;

  /**
   * Optional KMS key for Plaid `providerAccessToken` envelope
   * encryption (P12 / FW-1). When provided, the shared Lambda
   * execution role is granted `kms:Encrypt` and `kms:Decrypt`, and
   * `PLAID_TOKEN_KMS_KEY_ID` is injected into every function's
   * environment so the runtime helpers (`encryptToken` /
   * `decryptToken`) activate. savvue-api uses both operations
   * (exchange/relink writes + sync reads, and Decrypt in the Stripe
   * webhook's customer.deleted disconnect path).
   */
  plaidTokenKey?: kms.IKey;
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

    const { config, dynamodbTables, plaidTokenKey } = props;
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

    // Plaid token envelope encryption (P12). The shared role grants
    // Encrypt+Decrypt (exchange/relink + sync, plus the Stripe webhook's
    // customer.deleted disconnect path — all in the brand API).
    if (plaidTokenKey) {
      plaidTokenKey.grantEncryptDecrypt(executionRole);
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

      // Derive table name from function name (e.g., 'savvue-api' → 'savvue')
      // Each Lambda function connects to its own single table.
      // NOTE: canonical function names are `{brand}-api` (suffix), so strip
      // the trailing `-api`. The old `/^api-/` prefix-strip matched the
      // legacy `api-{brand}` names and silently failed to resolve the table
      // for the canonical names.
      const derivedTableName = fnConfig.name.replace(/-api$/, '');

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

      // Plaid token envelope encryption (P12). Runtime helpers in
      // `packages/shared/src/token-crypto.ts` activate when this var
      // is present; absence keeps them in passthrough mode.
      if (plaidTokenKey) {
        environment.PLAID_TOKEN_KMS_KEY_ID = plaidTokenKey.keyArn;
      }

      // Explicit, CFN-owned log group. Without this the group only exists
      // after the function's first invocation, so a brand-new function's
      // MetricFilter (createOrphan/UnknownPriceId alarms below) fails to
      // create with "log group does not exist" and rolls back the whole
      // stack. Passing it as the function's `logGroup` makes the runtime use
      // this group (no auto-create), and the metric filters depend on it.
      const logGroup = new logs.LogGroup(this, `${fnConfig.name}LogGroup`, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

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
        logGroup,
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

      // Optional Plaid orphan-item alarm. Wires CW MetricFilter + Alarm + SNS
      // for ops follow-up when /item/remove fails on a user-initiated
      // disconnect (Gap-11). The metric filter targets the function's
      // auto-created log group.
      if (fnConfig.orphanPlaidItemAlarm) {
        this.createOrphanPlaidItemAlarm(
          fnConfig.name,
          logGroup,
          fnConfig.orphanPlaidItemAlarm.opsEmail,
        );
      }

      // Optional unknown-priceId alarm. Same shape as the Plaid orphan alarm
      // but matches `unknown_priceId_in_` log markers from the brand API
      // (routes/billing.ts + routes/stripe-webhook.ts). PX.1.
      if (fnConfig.unknownPriceIdAlarm) {
        this.createUnknownPriceIdAlarm(
          fnConfig.name,
          logGroup,
          fnConfig.unknownPriceIdAlarm.opsEmail,
        );
      }
    }
  }

  /**
   * Create CloudWatch MetricFilter + Alarm + SNS topic for the
   * `plaid_item_remove_failed_orphan` log marker emitted by savvue-api
   * when a Plaid `/item/remove` call fails during a user-initiated
   * disconnect. See Gap-11 in the stripe-integration-spec.
   */
  private createOrphanPlaidItemAlarm(
    fnName: string,
    logGroup: logs.ILogGroup,
    opsEmail: string,
  ): void {
    const metricNamespace = `SaaS/${fnName}`;
    const metricName = 'PlaidItemRemoveFailedOrphan';

    new logs.MetricFilter(this, `${fnName}OrphanPlaidItemMetricFilter`, {
      logGroup,
      filterName: this.naming.resourceName(`${fnName}-orphan-plaid-item`),
      filterPattern: logs.FilterPattern.literal('"plaid_item_remove_failed_orphan"'),
      metricNamespace,
      metricName,
      metricValue: '1',
      defaultValue: 0,
    });

    const topic = new sns.Topic(this, `${fnName}OrphanPlaidItemTopic`, {
      topicName: this.naming.resourceName(`${fnName}-orphan-plaid-item-alerts`),
      displayName: `${fnName} orphan Plaid item alerts`,
    });
    topic.addSubscription(new snsSubs.EmailSubscription(opsEmail));

    const alarm = new cloudwatch.Alarm(this, `${fnName}OrphanPlaidItemAlarm`, {
      alarmName: this.naming.resourceName(`${fnName}-orphan-plaid-item`),
      alarmDescription:
        `Plaid /item/remove failed during user-initiated disconnect on ${fnName}. ` +
        `The local connection row was deleted but the Plaid item remains active and ` +
        `continues to accrue per-item billing. Take providerItemId from the log event ` +
        `and remove the item from the Plaid Dashboard. See Gap-11 in stripe-integration-spec.`,
      metric: new cloudwatch.Metric({
        namespace: metricNamespace,
        metricName,
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new cwActions.SnsAction(topic));
  }

  /**
   * Create CloudWatch MetricFilter + Alarm + SNS topic for the
   * `unknown_priceId_in_*` log markers emitted by core-api (billing.ts and
   * webhook.ts) when `getPlanFromPriceId` can't map a Stripe price ID to a
   * known plan. Indicates env-var / manifest drift; ops should reconcile
   * the deployed `STRIPE_PRICE_ID_*` env vars against the active prices in
   * the Stripe dashboard. PX.1 in stripe-integration-spec.
   */
  private createUnknownPriceIdAlarm(
    fnName: string,
    logGroup: logs.ILogGroup,
    opsEmail: string,
  ): void {
    const metricNamespace = `SaaS/${fnName}`;
    const metricName = 'UnknownStripePriceId';

    new logs.MetricFilter(this, `${fnName}UnknownPriceIdMetricFilter`, {
      logGroup,
      filterName: this.naming.resourceName(`${fnName}-unknown-price-id`),
      filterPattern: logs.FilterPattern.literal('"unknown_priceId_in_"'),
      metricNamespace,
      metricName,
      metricValue: '1',
      defaultValue: 0,
    });

    const topic = new sns.Topic(this, `${fnName}UnknownPriceIdTopic`, {
      topicName: this.naming.resourceName(`${fnName}-unknown-price-id-alerts`),
      displayName: `${fnName} unknown Stripe price-id alerts`,
    });
    topic.addSubscription(new snsSubs.EmailSubscription(opsEmail));

    const alarm = new cloudwatch.Alarm(this, `${fnName}UnknownPriceIdAlarm`, {
      alarmName: this.naming.resourceName(`${fnName}-unknown-price-id`),
      alarmDescription:
        `Stripe price ID failed to map to a known plan in ${fnName} ` +
        `(getPlanFromPriceId returned null). The deployed STRIPE_PRICE_ID_* ` +
        `env vars are out of sync with the prices Stripe is sending — likely ` +
        `a manifest/CDK drift after a price was added or rotated. Inspect the ` +
        `log event for { priceId, subscriptionId, productId } and reconcile. ` +
        `See cross-cutting PX.1 in stripe-integration-spec.`,
      metric: new cloudwatch.Metric({
        namespace: metricNamespace,
        metricName,
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new cwActions.SnsAction(topic));
  }
}
