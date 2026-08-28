import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { BaseStack, BaseStackProps } from '../../../../stacks/base';

export interface TrialExpiryStackProps extends BaseStackProps {
  /**
   * DynamoDB table name containing the brand's Subscription rows.
   *
   * Phase 9 (core → savvue consolidation): the checker runs against the
   * declaring brand's own table — the separate core table no longer exists.
   * The handler reads this as `DYNAMODB_TABLE_NAME`.
   */
  tableName: string;

  /**
   * DynamoDB table ARN for IAM permissions
   */
  tableArn: string;

  /**
   * Un-prefixed ECR service name to import the Lambda image from.
   *
   * The stack passes this through `naming.resourceName(...)` so the final
   * repo name becomes `saas-{env}-{ecrServiceName}`.
   *
   * @default 'core-trial-expiry-checker' — the per-service repo (legacy
   * "core" name kept through the Phase 9 consolidation to avoid an ECR
   * re-seed; renaming is optional post-cutover cleanup).
   */
  ecrServiceName?: string;
}

/**
 * Stack that creates a scheduled Lambda function to expire trials.
 *
 * Uses DockerImageFunction from ECR instead of inline code to avoid the
 * CloudFormation ZipFile 4096-char limit.
 *
 * Creates:
 * - DockerImageFunction referencing the trial-expiry-checker ECR repository
 * - EventBridge rule scheduled daily at 00:00 UTC
 * - IAM permissions for DynamoDB and ECR access
 *
 * Trial expiry logic (Soft-Lock policy):
 * 1. Query GSI2 on the brand table for trialExpired=false AND trialEndsAt < now
 * 2. Skip any with planStatus='active' (paid subscribers who had a trial)
 * 3. Update subscription: plan='free', planStatus=null, trialExpired=true
 *
 * Plaid items are NOT disconnected here — the webapp gates the Accounts
 * screen until the user removes enough connections to fit the new plan limit.
 */
export class TrialExpiryStack extends BaseStack {
  public readonly expiryFunction: lambda.DockerImageFunction;

  constructor(scope: cdk.App, id: string, props: TrialExpiryStackProps) {
    super(scope, id, 'TrialExpiry', props);

    const { tableName, tableArn } = props;

    // Look up the ECR repo containing the trial-expiry-checker image.
    const ecrServiceName = props.ecrServiceName ?? 'core-trial-expiry-checker';
    const ecrRepository = ecr.Repository.fromRepositoryName(
      this,
      'TrialExpiryEcrRepo',
      this.naming.resourceName(ecrServiceName),
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
        DYNAMODB_TABLE_NAME: tableName,
      },
      description: 'Daily trial expiry checker — flips expired trials to free (Soft-Lock policy)',
    });

    // Grant ECR pull access
    ecrRepository.grantPull(this.expiryFunction);

    // Grant DynamoDB permissions on the brand table (GSI2 query + patch)
    this.expiryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:Query', 'dynamodb:UpdateItem'],
        resources: [tableArn, `${tableArn}/index/*`],
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
