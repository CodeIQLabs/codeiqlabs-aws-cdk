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
    const stackConfig = this.getStackConfig();
    const envName = stackConfig.environment;

    // SSM parameter prefix
    const ssmPrefix = `/codeiqlabs/saas/${envName}`;

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
        let lambdaFn: lambda.IFunction;

        if (lambdaFunctions?.has(rule.targetLambdaName)) {
          lambdaFn = lambdaFunctions.get(rule.targetLambdaName)!;
        } else {
          // Import Lambda function ARN from SSM
          const lambdaArn = ssm.StringParameter.valueFromLookup(
            this,
            `${ssmPrefix}/lambda/${rule.targetLambdaName}-arn`,
          );
          lambdaFn = lambda.Function.fromFunctionArn(
            this,
            `${rule.targetLambdaName}Function`,
            lambdaArn,
          );
        }

        eventRule.addTarget(
          new targets.LambdaFunction(lambdaFn, {
            deadLetterQueue: this.deadLetterQueue,
            retryAttempts: rule.retryAttempts ?? 3,
          }),
        );
      }
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
}
