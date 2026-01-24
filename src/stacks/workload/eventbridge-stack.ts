/**
 * EventBridge Stack for Workload Infrastructure
 *
 * Creates EventBridge event bus with routing rules and DLQ for async communication.
 *
 * Architecture:
 * - Event bus: saas-{env}-events
 * - Dead Letter Queue for failed events
 * - Rules for subscription events (trial expired, upgraded, downgraded)
 * - Lambda targets with retry logic
 *
 * Event Handler Rules:
 * When `eventHandlerBrands` is provided, creates rules for each brand:
 * - subscription.tier.changed (productId={brand}) → tier-changed-{brand} Lambda
 * - subscription.upgraded (productId={brand}) → upgrade-handler-{brand} Lambda
 * - subscription.trial.expired (productId={brand}) → trial-expiry-{brand} Lambda
 *
 * @example
 * ```typescript
 * new EventBridgeStack(app, 'EventBridge', {
 *   stackConfig: {
 *     project: 'SaaS',
 *     environment: 'nprd',
 *     region: 'us-east-1',
 *     accountId: '466279485605',
 *     owner: 'CodeIQLabs',
 *     company: 'CodeIQLabs',
 *   },
 *   config: {
 *     eventRules: [
 *       {
 *         name: 'trial-expired-savvue',
 *         source: 'api-core',
 *         detailType: 'subscription.trial.expired',
 *         detailFilter: { productId: ['savvue'] },
 *         targetLambdaName: 'trial-expiry-savvue',
 *       },
 *     ],
 *     // Automatically create event handler rules for these brands
 *     eventHandlerBrands: ['savvue', 'equitrio'],
 *   },
 * });
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Event rule configuration
 */
export interface EventRuleConfig {
  /**
   * Rule name (e.g., 'trial-expired-savvue')
   */
  name: string;

  /**
   * Event source (e.g., 'api-core', 'api-savvue')
   */
  source: string;

  /**
   * Event detail type (e.g., 'subscription.trial.expired')
   */
  detailType: string;

  /**
   * Optional detail filter (e.g., { productId: ['savvue'] })
   */
  detailFilter?: Record<string, string[]>;

  /**
   * Target Lambda function name
   * If not provided, rule will not have a target (for future use)
   */
  targetLambdaName?: string;

  /**
   * Number of retry attempts
   * @default 3
   */
  retryAttempts?: number;
}

/**
 * EventBridge stack configuration
 */
export interface EventBridgeConfig {
  /**
   * Event rules to create
   */
  eventRules?: EventRuleConfig[];

  /**
   * DLQ retention period in days
   * @default 14
   */
  dlqRetentionDays?: number;

  /**
   * Brands that can publish events (for granting permissions)
   */
  publisherBrands?: string[];

  /**
   * Brands that have event handlers enabled.
   * For each brand, creates EventBridge rules for:
   * - subscription.tier.changed (productId={brand}) → tier-changed-{brand} Lambda
   * - subscription.upgraded (productId={brand}) → upgrade-handler-{brand} Lambda
   * - subscription.trial.expired (productId={brand}) → trial-expiry-{brand} Lambda
   *
   * Rules are configured with:
   * - 3 retry attempts with exponential backoff
   * - Dead Letter Queue for failed events
   */
  eventHandlerBrands?: string[];

  /**
   * Number of retry attempts for event handler rules
   * @default 3
   */
  eventHandlerRetryAttempts?: number;
}

export interface EventBridgeStackProps extends BaseStackProps {
  /**
   * EventBridge configuration
   */
  config: EventBridgeConfig;

  /**
   * Map of Lambda functions by name
   * If not provided, functions will be imported from SSM
   */
  lambdaFunctions?: Map<string, lambda.IFunction>;
}

/**
 * EventBridge Stack for async event communication
 *
 * Creates event bus, DLQ, and routing rules.
 */
export class EventBridgeStack extends BaseStack {
  public readonly eventBus: events.EventBus;
  public readonly deadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: EventBridgeStackProps) {
    super(scope, id, 'EventBridge', props);

    const { config, lambdaFunctions } = props;

    // Create Event Bus
    this.eventBus = new events.EventBus(this, 'EventBus', {
      eventBusName: this.naming.resourceName('events'),
    });

    // Create Dead Letter Queue for failed events
    this.deadLetterQueue = new sqs.Queue(this, 'EventsDLQ', {
      queueName: this.naming.resourceName('events-dlq'),
      retentionPeriod: cdk.Duration.days(config.dlqRetentionDays ?? 14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // Create rules for each event configuration
    for (const rule of config.eventRules ?? []) {
      this.createEventRule(rule, lambdaFunctions);
    }

    // Create event handler rules for each brand with eventHandlers enabled
    // This creates rules for subscription.tier.changed and subscription.upgraded events
    // filtered by productId to route to brand-specific Lambda handlers
    if (config.eventHandlerBrands && config.eventHandlerBrands.length > 0) {
      const retryAttempts = config.eventHandlerRetryAttempts ?? 3;
      this.createEventHandlerRules(config.eventHandlerBrands, retryAttempts, lambdaFunctions);
    }

    // Store EventBridge parameters in SSM
    new ssm.StringParameter(this, 'EventBusNameParameter', {
      parameterName: this.naming.ssmParameterName('eventbridge', 'bus-name'),
      stringValue: this.eventBus.eventBusName,
      description: 'EventBridge event bus name',
    });

    new ssm.StringParameter(this, 'EventBusArnParameter', {
      parameterName: this.naming.ssmParameterName('eventbridge', 'bus-arn'),
      stringValue: this.eventBus.eventBusArn,
      description: 'EventBridge event bus ARN',
    });

    new ssm.StringParameter(this, 'DlqUrlParameter', {
      parameterName: this.naming.ssmParameterName('eventbridge', 'dlq-url'),
      stringValue: this.deadLetterQueue.queueUrl,
      description: 'EventBridge DLQ URL',
    });

    // Output EventBridge resources
    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      exportName: this.naming.exportName('eventbridge-bus-name'),
      description: 'EventBridge event bus name',
    });

    new cdk.CfnOutput(this, 'EventBusArn', {
      value: this.eventBus.eventBusArn,
      exportName: this.naming.exportName('eventbridge-bus-arn'),
      description: 'EventBridge event bus ARN',
    });

    new cdk.CfnOutput(this, 'DlqUrl', {
      value: this.deadLetterQueue.queueUrl,
      exportName: this.naming.exportName('eventbridge-dlq-url'),
      description: 'EventBridge DLQ URL',
    });
  }

  /**
   * Grant a Lambda function permission to publish events to the event bus
   */
  public grantPublish(lambdaFn: lambda.IFunction): void {
    this.eventBus.grantPutEventsTo(lambdaFn);
  }

  /**
   * Create an EventBridge rule from configuration
   */
  private createEventRule(
    rule: EventRuleConfig,
    lambdaFunctions: Map<string, lambda.IFunction> | undefined,
  ): events.Rule {
    // Build event pattern
    const eventPattern: events.EventPattern = {
      source: [rule.source],
      detailType: [rule.detailType],
      ...(rule.detailFilter && { detail: rule.detailFilter }),
    };

    // Create rule
    const eventRule = new events.Rule(this, `${rule.name}Rule`, {
      eventBus: this.eventBus,
      ruleName: this.naming.resourceName(rule.name),
      eventPattern,
    });

    // Add Lambda target if specified
    if (rule.targetLambdaName) {
      const lambdaFn = this.getLambdaFunction(rule.targetLambdaName, lambdaFunctions);

      eventRule.addTarget(
        new targets.LambdaFunction(lambdaFn, {
          deadLetterQueue: this.deadLetterQueue,
          retryAttempts: rule.retryAttempts ?? 3,
        }),
      );
    }

    return eventRule;
  }

  /**
   * Get a Lambda function by name, either from the provided map or by importing from SSM
   */
  private getLambdaFunction(
    functionName: string,
    lambdaFunctions: Map<string, lambda.IFunction> | undefined,
  ): lambda.IFunction {
    if (lambdaFunctions?.has(functionName)) {
      return lambdaFunctions.get(functionName)!;
    }

    // Import Lambda function ARN from SSM using naming convention
    const lambdaArn = ssm.StringParameter.valueFromLookup(
      this,
      this.naming.ssmParameterName('lambda', `${functionName}-arn`),
    );
    return lambda.Function.fromFunctionArn(this, `${functionName}Function`, lambdaArn);
  }

  /**
   * Create EventBridge rules for event handlers for each brand.
   *
   * For each brand, creates three rules:
   * 1. subscription.tier.changed (productId={brand}) → tier-changed-{brand} Lambda
   * 2. subscription.upgraded (productId={brand}) → upgrade-handler-{brand} Lambda
   * 3. subscription.trial.expired (productId={brand}) → trial-expiry-{brand} Lambda
   *
   * Rules are configured with:
   * - Source: 'api-core' (the shared service that publishes subscription events)
   * - Detail filter: productId matches the brand name
   * - Retry attempts: configurable (default 3)
   * - Dead Letter Queue: events-dlq for failed events
   *
   * @param brands - Array of brand names with event handlers enabled
   * @param retryAttempts - Number of retry attempts for failed events
   * @param lambdaFunctions - Optional map of Lambda functions (if not provided, imports from SSM)
   */
  private createEventHandlerRules(
    brands: string[],
    retryAttempts: number,
    lambdaFunctions: Map<string, lambda.IFunction> | undefined,
  ): void {
    for (const brand of brands) {
      // Create rule for subscription.tier.changed events
      // Routes to tier-changed-{brand} Lambda which updates HouseholdEntity.tier
      this.createEventRule(
        {
          name: `tier-changed-${brand}`,
          source: 'api-core',
          detailType: 'subscription.tier.changed',
          detailFilter: { productId: [brand] },
          targetLambdaName: `tier-changed-${brand}`,
          retryAttempts,
        },
        lambdaFunctions,
      );

      // Create rule for subscription.upgraded events
      // Routes to upgrade-handler-{brand} Lambda which handles upgrade-specific logic
      this.createEventRule(
        {
          name: `upgrade-handler-${brand}`,
          source: 'api-core',
          detailType: 'subscription.upgraded',
          detailFilter: { productId: [brand] },
          targetLambdaName: `upgrade-handler-${brand}`,
          retryAttempts,
        },
        lambdaFunctions,
      );

      // Create rule for subscription.trial.expired events
      // Routes to trial-expiry-{brand} Lambda which locks excess bank connections
      this.createEventRule(
        {
          name: `trial-expiry-${brand}`,
          source: 'api-core',
          detailType: 'subscription.trial.expired',
          detailFilter: { productId: [brand] },
          targetLambdaName: `trial-expiry-${brand}`,
          retryAttempts,
        },
        lambdaFunctions,
      );

      // Savvue-specific: Create rule for transaction.categorized events
      // Routes to auto-matcher-handler-savvue Lambda which creates suggestions for similar transactions
      if (brand === 'savvue') {
        this.createEventRule(
          {
            name: `auto-matcher-handler-${brand}`,
            source: 'api-savvue',
            detailType: 'transaction.categorized',
            detailFilter: { productId: [brand] },
            targetLambdaName: `auto-matcher-handler-${brand}`,
            retryAttempts,
          },
          lambdaFunctions,
        );
      }
    }
  }
}
