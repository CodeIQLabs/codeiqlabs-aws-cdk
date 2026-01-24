/**
 * Scheduled Job Lambda Stack for Workload Infrastructure
 *
 * Creates Lambda functions from ECR images with EventBridge scheduled rules.
 * Scheduled jobs run periodic background tasks like transaction matching,
 * unlock checking, and budget rollovers.
 *
 * Architecture:
 * - Lambda functions deployed without VPC (faster cold starts, direct AWS service access)
 * - EventBridge rules with schedule expressions (rate or cron)
 * - IAM roles grant read/write access to brand's DynamoDB table
 * - SSM parameters for function ARN discovery
 *
 * @example
 * ```typescript
 * new ScheduledJobLambdaStack(app, 'ScheduledJobLambda', {
 *   stackConfig: {
 *     project: 'SaaS',
 *     environment: 'nprd',
 *     region: 'us-east-1',
 *     accountId: '466279485605',
 *     owner: 'CodeIQLabs',
 *     company: 'CodeIQLabs',
 *   },
 *   brand: 'savvue',
 *   jobs: [
 *     { name: 'auto-matcher', schedule: 'rate(1 hour)', memorySize: 1024, timeout: 300 },
 *     { name: 'unlock-checker', schedule: 'rate(15 minutes)', memorySize: 512, timeout: 60 },
 *     { name: 'rollover', schedule: 'cron(0 6 1 * ? *)', memorySize: 1024, timeout: 300 },
 *   ],
 *   dynamodbTable: dynamodbStack.tables.get('savvue'),
 * });
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Configuration for a scheduled job
 */
export interface ScheduledJobConfig {
  /**
   * Job name (e.g., 'auto-matcher', 'unlock-checker', 'rollover')
   * Used for Lambda function naming and ECR image command
   */
  name: string;

  /**
   * Human-readable description of what the job does
   */
  description?: string;

  /**
   * EventBridge schedule expression
   * Supports both rate and cron expressions:
   * - rate(1 hour), rate(15 minutes), rate(1 day)
   * - cron(0 6 1 * ? *) - 1st of month at 6 AM UTC
   * @see https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-scheduled-rule-pattern.html
   */
  schedule: string;

  /**
   * Memory size in MB
   * More memory = more CPU = faster execution
   * @default 1024
   */
  memorySize?: number;

  /**
   * Timeout in seconds
   * Background jobs may need longer timeouts than API handlers
   * @default 300 (5 minutes)
   */
  timeout?: number;

  /**
   * ECR image tag
   * @default 'latest'
   */
  imageTag?: string;

  /**
   * Whether the schedule rule is enabled
   * Set to false to disable the job without removing it
   * @default true
   */
  enabled?: boolean;
}

/**
 * Props for ScheduledJobLambdaStack
 */
export interface ScheduledJobLambdaStackProps extends BaseStackProps {
  /**
   * Brand name (e.g., 'savvue', 'equitrio')
   * Used for resource naming and DynamoDB table access
   */
  brand: string;

  /**
   * Scheduled job configurations
   */
  jobs: ScheduledJobConfig[];

  /**
   * DynamoDB table for data access
   * Jobs get read/write access to the brand's table
   */
  dynamodbTable: dynamodb.Table;

  /**
   * Core DynamoDB table for cross-brand data access (optional)
   * Some jobs may need to access core entities (e.g., subscriptions)
   */
  coreTable?: dynamodb.Table;

  /**
   * EventBridge bus name for event publishing (if jobs need to publish events)
   * @default undefined (no EventBridge publish access)
   */
  eventBridgeBusName?: string;
}

/**
 * Scheduled Job Lambda Stack
 *
 * Creates Lambda functions for background jobs with:
 * - EventBridge scheduled rules (rate or cron expressions)
 * - Read/write access to brand's DynamoDB table
 * - Optional access to core table for cross-brand data
 * - CloudWatch Logs permissions
 * - SSM parameters for function ARN discovery
 */
export class ScheduledJobLambdaStack extends BaseStack {
  /**
   * Map of job name to Lambda function
   * Keys: 'auto-matcher', 'unlock-checker', 'rollover', etc.
   */
  public readonly functions: Map<string, lambda.Function> = new Map();

  /**
   * Map of job name to EventBridge rule
   */
  public readonly scheduleRules: Map<string, events.Rule> = new Map();

  constructor(scope: Construct, id: string, props: ScheduledJobLambdaStackProps) {
    super(scope, id, 'ScheduledJobLambda', props);

    const { brand, jobs, dynamodbTable, coreTable, eventBridgeBusName } = props;
    const stackConfig = this.getStackConfig();

    // Import ECR repository for scheduled jobs
    // Repository naming: {brand}-jobs (e.g., savvue-jobs)
    const ecrRepository = ecr.Repository.fromRepositoryName(
      this,
      `${brand}JobsEcrRepo`,
      this.naming.resourceName(`${brand}-jobs`),
    );

    // Create execution role for all jobs in this brand
    // Jobs share a role since they operate on the same brand's data
    const executionRole = this.createExecutionRole(
      brand,
      dynamodbTable,
      coreTable,
      stackConfig,
      eventBridgeBusName,
    );

    // Grant ECR pull permissions to the execution role
    ecrRepository.grantPull(executionRole);

    // Build base environment variables
    const baseEnvironment: Record<string, string> = {
      NODE_ENV: 'production',
      DYNAMODB_TABLE_NAME: dynamodbTable.tableName,
      BRAND: brand,
    };

    // Add core table if provided
    if (coreTable) {
      baseEnvironment.CORE_TABLE_NAME = coreTable.tableName;
    }

    // Add EventBridge bus name if configured
    if (eventBridgeBusName) {
      baseEnvironment.EVENTBRIDGE_BUS_NAME = eventBridgeBusName;
    }

    // Create Lambda functions and schedule rules for each job
    for (const job of jobs) {
      const {
        name,
        description,
        schedule,
        memorySize = 1024,
        timeout = 300,
        imageTag = 'latest',
        enabled = true,
      } = job;

      // Create Lambda function
      const fn = this.createJobFunction(
        name,
        brand,
        ecrRepository,
        executionRole,
        baseEnvironment,
        memorySize,
        timeout,
        imageTag,
        description,
      );

      this.functions.set(name, fn);

      // Create EventBridge schedule rule
      const rule = this.createScheduleRule(name, brand, schedule, fn, enabled, description);

      this.scheduleRules.set(name, rule);

      // Store function ARN in SSM for discovery
      new ssm.StringParameter(this, `${name}ArnParameter`, {
        parameterName: this.naming.ssmParameterName('lambda', `${brand}-${name}-arn`),
        stringValue: fn.functionArn,
        description: `Lambda function ARN for ${brand} ${name} job`,
      });

      // Output function ARN
      new cdk.CfnOutput(this, `${name}FunctionArn`, {
        value: fn.functionArn,
        exportName: this.naming.exportName(`lambda-${brand}-${name}-arn`),
        description: `Lambda function ARN for ${brand} ${name} job`,
      });
    }

    // Apply standard tags
    cdk.Tags.of(this).add('Component', 'ScheduledJobs');
    cdk.Tags.of(this).add('Brand', brand);
  }

  /**
   * Create an IAM execution role for the brand's scheduled jobs
   *
   * Grants:
   * - Read/write access to brand's DynamoDB table
   * - Read/write access to core table (if provided)
   * - CloudWatch Logs permissions
   * - EventBridge publish permissions (if configured)
   */
  private createExecutionRole(
    brand: string,
    brandTable: dynamodb.Table,
    coreTable: dynamodb.Table | undefined,
    stackConfig: ReturnType<typeof this.getStackConfig>,
    eventBridgeBusName?: string,
  ): iam.Role {
    const executionRole = new iam.Role(this, `${brand}ScheduledJobExecutionRole`, {
      roleName: this.naming.resourceName(`${brand}-scheduled-job-role`),
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        // Basic execution role for CloudWatch Logs
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        // X-Ray tracing permissions
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
      ],
    });

    // Grant read/write access to brand's DynamoDB table
    brandTable.grantReadWriteData(executionRole);

    // Grant read/write access to core table if provided
    if (coreTable) {
      coreTable.grantReadWriteData(executionRole);
    }

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
   * Create a Lambda function for a scheduled job
   */
  private createJobFunction(
    jobName: string,
    brand: string,
    ecrRepository: ecr.IRepository,
    executionRole: iam.Role,
    environment: Record<string, string>,
    memorySize: number,
    timeout: number,
    imageTag: string,
    description?: string,
  ): lambda.DockerImageFunction {
    const functionName = this.naming.resourceName(`${brand}-${jobName}`);

    // Create Lambda function from ECR image (no VPC for faster cold starts)
    // The CMD points to the job's handler export (e.g., auto-matcher-job.handler)
    const fn = new lambda.DockerImageFunction(this, `${jobName}Function`, {
      functionName,
      description: description || `Scheduled job: ${jobName} for ${brand}`,
      code: lambda.DockerImageCode.fromEcr(ecrRepository, {
        tagOrDigest: imageTag,
        cmd: [`${jobName}-job.handler`],
      }),
      memorySize,
      timeout: cdk.Duration.seconds(timeout),
      role: executionRole,
      environment,
      tracing: lambda.Tracing.ACTIVE,
      // Reserved concurrency of 1 ensures only one instance runs at a time
      // This prevents overlapping job executions
      reservedConcurrentExecutions: 1,
    });

    return fn;
  }

  /**
   * Create an EventBridge schedule rule for a job
   */
  private createScheduleRule(
    jobName: string,
    brand: string,
    schedule: string,
    fn: lambda.Function,
    enabled: boolean,
    description?: string,
  ): events.Rule {
    // Parse schedule expression
    const scheduleExpression = this.parseScheduleExpression(schedule);

    const rule = new events.Rule(this, `${jobName}ScheduleRule`, {
      ruleName: this.naming.resourceName(`${brand}-${jobName}-schedule`),
      description: description || `Schedule for ${brand} ${jobName} job`,
      schedule: scheduleExpression,
      enabled,
    });

    // Add Lambda as target
    rule.addTarget(
      new targets.LambdaFunction(fn, {
        retryAttempts: 2, // Retry twice on failure
      }),
    );

    // Output schedule rule ARN
    new cdk.CfnOutput(this, `${jobName}ScheduleRuleArn`, {
      value: rule.ruleArn,
      exportName: this.naming.exportName(`schedule-${brand}-${jobName}-arn`),
      description: `EventBridge rule ARN for ${brand} ${jobName} schedule`,
    });

    return rule;
  }

  /**
   * Parse a schedule expression string into an EventBridge Schedule
   *
   * Supports:
   * - rate(1 hour), rate(15 minutes), rate(1 day)
   * - cron(0 6 1 * ? *)
   */
  private parseScheduleExpression(expression: string): events.Schedule {
    const trimmed = expression.trim();

    if (trimmed.startsWith('rate(')) {
      // Parse rate expression: rate(1 hour), rate(15 minutes), etc.
      const match = trimmed.match(/^rate\((\d+)\s+(minute|minutes|hour|hours|day|days)\)$/i);
      if (!match) {
        throw new Error(`Invalid rate expression: ${expression}`);
      }

      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();

      switch (unit) {
        case 'minute':
        case 'minutes':
          return events.Schedule.rate(cdk.Duration.minutes(value));
        case 'hour':
        case 'hours':
          return events.Schedule.rate(cdk.Duration.hours(value));
        case 'day':
        case 'days':
          return events.Schedule.rate(cdk.Duration.days(value));
        default:
          throw new Error(`Unsupported rate unit: ${unit}`);
      }
    } else if (trimmed.startsWith('cron(')) {
      // Parse cron expression: cron(0 6 1 * ? *)
      const match = trimmed.match(/^cron\((.+)\)$/);
      if (!match) {
        throw new Error(`Invalid cron expression: ${expression}`);
      }

      const cronParts = match[1].trim().split(/\s+/);
      if (cronParts.length !== 6) {
        throw new Error(`Cron expression must have 6 fields: ${expression}`);
      }

      const [minute, hour, day, month, weekDay, year] = cronParts;
      return events.Schedule.cron({
        minute: minute === '?' ? undefined : minute,
        hour: hour === '?' ? undefined : hour,
        day: day === '?' ? undefined : day,
        month: month === '?' ? undefined : month,
        weekDay: weekDay === '?' ? undefined : weekDay,
        year: year === '?' || year === '*' ? undefined : year,
      });
    } else {
      throw new Error(`Schedule expression must start with rate( or cron(: ${expression}`);
    }
  }
}
