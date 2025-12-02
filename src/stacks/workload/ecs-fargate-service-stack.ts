/**
 * ECS Fargate Service Stack for Workload Infrastructure
 *
 * Creates a shared ALB with path-based routing for multiple brand services.
 * Each brand's marketing site runs as a separate ECS Fargate service behind the shared ALB.
 *
 * Architecture:
 * - Shared ALB with HTTPS listener (references cross-account ACM certificate)
 * - Path-based routing: /savvue/* → Savvue service, /timisly/* → Timisly service, etc.
 * - Default route goes to CodeIQLabs umbrella brand
 * - SSM parameter exports ALB DNS for cross-account CloudFront origin discovery
 *
 * @example
 * ```typescript
 * new EcsFargateServiceStack(app, 'Marketing', {
 *   stackConfig: {
 *     project: 'CodeIQLabs-SaaS',
 *     environment: 'nprd',
 *     region: 'us-east-1',
 *     accountId: '466279485605',
 *     owner: 'CodeIQLabs',
 *     company: 'CodeIQLabs',
 *   },
 *   vpc: vpcStack.vpc,
 *   cluster: clusterStack.cluster,
 *   albSecurityGroup: vpcStack.albSecurityGroup,
 *   ecsSecurityGroup: vpcStack.ecsSecurityGroup,
 *   serviceConfig: {
 *     appKind: 'marketing',
 *     brands: ['codeiqlabs', 'savvue', 'timisly', 'realtava', 'equitrio'],
 *     managementAccountId: '682475224767',
 *     certificateArn: 'arn:aws:acm:us-east-1:682475224767:certificate/xxx',
 *   },
 * });
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Brand service configuration
 */
export interface BrandServiceConfig {
  /**
   * Brand name (e.g., 'savvue', 'timisly')
   */
  brand: string;

  /**
   * Path pattern for routing (e.g., '/savvue/*')
   * If not specified, defaults to '/{brand}/*'
   */
  pathPattern?: string;

  /**
   * Priority for the listener rule (lower = higher priority)
   * If not specified, auto-assigned based on order
   */
  priority?: number;

  /**
   * Container port
   * @default 3000
   */
  containerPort?: number;

  /**
   * Health check path
   * @default '/health'
   */
  healthCheckPath?: string;

  /**
   * Desired task count
   * @default 1
   */
  desiredCount?: number;

  /**
   * CPU units (256, 512, 1024, 2048, 4096)
   * @default 256
   */
  cpu?: number;

  /**
   * Memory in MB (512, 1024, 2048, etc.)
   * @default 512
   */
  memoryMiB?: number;
}

/**
 * ECS Fargate Service configuration
 */
export interface EcsFargateServiceConfig {
  /**
   * Application kind (e.g., 'marketing', 'api')
   * Used for SSM parameter naming: /codeiqlabs/saas/{env}/{appKind}/alb-dns
   */
  appKind: string;

  /**
   * List of brands to deploy services for
   * Each brand gets its own ECS service with path-based routing
   */
  brands: string[];

  /**
   * Management account ID for cross-account certificate reference
   */
  managementAccountId: string;

  /**
   * ACM certificate ARN from Management account
   * Must be in the same region as the ALB
   * If not provided, ALB will use HTTP only (suitable when CloudFront handles SSL)
   */
  certificateArn?: string;

  /**
   * Default brand for the root path
   * @default 'codeiqlabs'
   */
  defaultBrand?: string;

  /**
   * Per-brand configuration overrides
   */
  brandConfigs?: Record<string, Partial<BrandServiceConfig>>;

  /**
   * Default container port for all services
   * @default 3000
   */
  defaultContainerPort?: number;

  /**
   * Default health check path for all services
   * @default '/health'
   */
  defaultHealthCheckPath?: string;

  /**
   * Default desired task count for all services
   * @default 1
   */
  defaultDesiredCount?: number;

  /**
   * Default CPU units for all services
   * @default 256
   */
  defaultCpu?: number;

  /**
   * Default memory in MB for all services
   * @default 512
   */
  defaultMemoryMiB?: number;

  /**
   * Log retention in days
   * @default 30
   */
  logRetentionDays?: number;

  /**
   * Secrets configuration for injecting secrets from Secrets Manager
   * If provided, secrets will be injected into containers as environment variables
   */
  secrets?: EcsSecretsConfig;
}

/**
 * Secrets configuration for ECS containers
 * Secrets are injected from AWS Secrets Manager
 */
export interface EcsSecretsConfig {
  /**
   * Database URL secret ARN
   * Injected as DATABASE_URL environment variable
   */
  databaseUrlSecretArn?: string;

  /**
   * Stripe secret key secret ARN
   * Injected as STRIPE_SECRET_KEY environment variable
   */
  stripeSecretKeySecretArn?: string;

  /**
   * Auth.js secret ARN
   * Injected as AUTH_SECRET environment variable
   */
  authSecretArn?: string;

  /**
   * Map of brand name to Google OAuth secret ARN
   * Each secret should contain JSON with clientId and clientSecret
   * Injected as AUTH_GOOGLE_ID_{BRAND} and AUTH_GOOGLE_SECRET_{BRAND}
   */
  googleOAuthSecretArns?: Record<string, string>;
}

/**
 * Props for EcsFargateServiceStack
 */
export interface EcsFargateServiceStackProps extends BaseStackProps {
  /**
   * VPC where services will be deployed
   */
  vpc: ec2.IVpc;

  /**
   * ECS cluster for the services
   */
  cluster: ecs.ICluster;

  /**
   * Security group for the ALB
   */
  albSecurityGroup: ec2.ISecurityGroup;

  /**
   * Security group for ECS tasks
   */
  ecsSecurityGroup: ec2.ISecurityGroup;

  /**
   * Service configuration
   */
  serviceConfig: EcsFargateServiceConfig;
}

/**
 * ECS Fargate Service Stack for workload infrastructure
 *
 * Creates a shared ALB with path-based routing for multiple brand services.
 * Exports ALB DNS via SSM parameter for cross-account CloudFront origin discovery.
 */
export class EcsFargateServiceStack extends BaseStack {
  /**
   * The Application Load Balancer
   */
  public readonly alb: elbv2.IApplicationLoadBalancer;

  /**
   * Map of brand name to ECS service
   */
  public readonly services: Map<string, ecs.FargateService> = new Map();

  /**
   * Map of brand name to ECR repository
   */
  public readonly repositories: Map<string, ecr.IRepository> = new Map();

  /**
   * SSM parameter containing the ALB DNS name
   */
  public readonly albDnsParameter: ssm.IStringParameter;

  constructor(scope: Construct, id: string, props: EcsFargateServiceStackProps) {
    super(scope, id, props.serviceConfig.appKind, props);

    const config = props.serviceConfig;
    const defaultContainerPort = config.defaultContainerPort ?? 3000;
    const defaultHealthCheckPath = config.defaultHealthCheckPath ?? '/health';
    const defaultDesiredCount = config.defaultDesiredCount ?? 1;
    const defaultCpu = config.defaultCpu ?? 256;
    const defaultMemoryMiB = config.defaultMemoryMiB ?? 512;
    const logRetentionDays = config.logRetentionDays ?? 30;
    const defaultBrand = config.defaultBrand ?? 'codeiqlabs';

    // Create Application Load Balancer
    // ALB names have a 32 character limit, so we use a shorter naming pattern
    // Pattern: {env}-{appKind}-alb (e.g., "nprd-marketing-alb")
    const albName = `${this.getStackConfig().environment}-${config.appKind}-alb`;
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: albName.substring(0, 32), // Ensure max 32 chars
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSecurityGroup,
    });

    // Create listener based on whether certificate is provided
    // If no certificate, use HTTP only (CloudFront handles SSL termination)
    let primaryListener: elbv2.IApplicationListener;

    if (config.certificateArn) {
      // Import the ACM certificate from Management account
      const certificate = acm.Certificate.fromCertificateArn(
        this,
        'Certificate',
        config.certificateArn,
      );

      // Create HTTPS listener
      primaryListener = this.alb.addListener('HttpsListener', {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [certificate],
        defaultAction: elbv2.ListenerAction.fixedResponse(404, {
          contentType: 'text/plain',
          messageBody: 'Not Found',
        }),
      });

      // Create HTTP listener that redirects to HTTPS
      this.alb.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: 'HTTPS',
          port: '443',
          permanent: true,
        }),
      });
    } else {
      // HTTP-only mode (CloudFront handles SSL termination)
      primaryListener = this.alb.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.fixedResponse(404, {
          contentType: 'text/plain',
          messageBody: 'Not Found',
        }),
      });
    }

    // Create ECS task execution role (shared across all services)
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: this.naming.iamRoleName(`${config.appKind}-task-exec`),
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Grant task execution role permission to read secrets if configured
    const secretsConfig = config.secrets;
    if (secretsConfig) {
      const secretArns: string[] = [];
      if (secretsConfig.databaseUrlSecretArn) secretArns.push(secretsConfig.databaseUrlSecretArn);
      if (secretsConfig.stripeSecretKeySecretArn)
        secretArns.push(secretsConfig.stripeSecretKeySecretArn);
      if (secretsConfig.authSecretArn) secretArns.push(secretsConfig.authSecretArn);
      if (secretsConfig.googleOAuthSecretArns) {
        secretArns.push(...Object.values(secretsConfig.googleOAuthSecretArns));
      }

      if (secretArns.length > 0) {
        taskExecutionRole.addToPolicy(
          new iam.PolicyStatement({
            sid: 'AllowSecretsManagerRead',
            effect: iam.Effect.ALLOW,
            actions: ['secretsmanager:GetSecretValue'],
            resources: secretArns,
          }),
        );
      }
    }

    // Create ECS task role (shared across all services)
    const taskRole = new iam.Role(this, 'TaskRole', {
      roleName: this.naming.iamRoleName(`${config.appKind}-task`),
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Create services for each brand
    let priority = 1;
    for (const brand of config.brands) {
      const brandConfig = config.brandConfigs?.[brand] ?? {};
      const containerPort = brandConfig.containerPort ?? defaultContainerPort;
      const healthCheckPath = brandConfig.healthCheckPath ?? defaultHealthCheckPath;
      const desiredCount = brandConfig.desiredCount ?? defaultDesiredCount;
      const cpu = brandConfig.cpu ?? defaultCpu;
      const memoryMiB = brandConfig.memoryMiB ?? defaultMemoryMiB;

      // Create ECR repository for this brand
      const repository = new ecr.Repository(this, `${brand}Repository`, {
        repositoryName: this.naming.resourceName(`${config.appKind}-${brand}`).toLowerCase(),
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        lifecycleRules: [
          {
            maxImageCount: 10,
            description: 'Keep only 10 images',
          },
        ],
      });
      this.repositories.set(brand, repository);

      // Create CloudWatch log group
      const logGroup = new logs.LogGroup(this, `${brand}LogGroup`, {
        logGroupName: `/ecs/${this.naming.resourceName(`${config.appKind}-${brand}`)}`,
        retention: logRetentionDays,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      // Create task definition
      const taskDefinition = new ecs.FargateTaskDefinition(this, `${brand}TaskDef`, {
        family: this.naming.resourceName(`${config.appKind}-${brand}`),
        cpu,
        memoryLimitMiB: memoryMiB,
        executionRole: taskExecutionRole,
        taskRole,
      });

      // Build secrets map for container
      const containerSecrets: Record<string, ecs.Secret> = {};
      if (secretsConfig) {
        if (secretsConfig.databaseUrlSecretArn) {
          const secret = secretsmanager.Secret.fromSecretCompleteArn(
            this,
            `${brand}DatabaseUrlSecret`,
            secretsConfig.databaseUrlSecretArn,
          );
          containerSecrets['DATABASE_URL'] = ecs.Secret.fromSecretsManager(secret);
        }
        if (secretsConfig.stripeSecretKeySecretArn) {
          const secret = secretsmanager.Secret.fromSecretCompleteArn(
            this,
            `${brand}StripeSecretKeySecret`,
            secretsConfig.stripeSecretKeySecretArn,
          );
          containerSecrets['STRIPE_SECRET_KEY'] = ecs.Secret.fromSecretsManager(secret);
        }
        if (secretsConfig.authSecretArn) {
          const secret = secretsmanager.Secret.fromSecretCompleteArn(
            this,
            `${brand}AuthSecret`,
            secretsConfig.authSecretArn,
          );
          containerSecrets['AUTH_SECRET'] = ecs.Secret.fromSecretsManager(secret);
        }
        // Add Google OAuth secrets for this brand
        if (secretsConfig.googleOAuthSecretArns?.[brand]) {
          const secret = secretsmanager.Secret.fromSecretCompleteArn(
            this,
            `${brand}GoogleOAuthSecret`,
            secretsConfig.googleOAuthSecretArns[brand],
          );
          // Google OAuth secret contains JSON with clientId and clientSecret
          containerSecrets[`AUTH_GOOGLE_ID_${brand.toUpperCase()}`] = ecs.Secret.fromSecretsManager(
            secret,
            'clientId',
          );
          containerSecrets[`AUTH_GOOGLE_SECRET_${brand.toUpperCase()}`] =
            ecs.Secret.fromSecretsManager(secret, 'clientSecret');
        }
      }

      // Add container to task definition
      taskDefinition.addContainer(`${brand}Container`, {
        containerName: brand,
        image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
        portMappings: [{ containerPort }],
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: brand,
          logGroup,
        }),
        environment: {
          BRAND: brand,
          NEXT_PUBLIC_BRAND: brand,
          NODE_ENV: this.getStackConfig().environment === 'prod' ? 'production' : 'development',
          // Add environment-specific URLs (these should be passed in via config in production)
          NEXT_PUBLIC_ENV: this.getStackConfig().environment,
        },
        secrets: Object.keys(containerSecrets).length > 0 ? containerSecrets : undefined,
      });

      // Create Fargate service
      const service = new ecs.FargateService(this, `${brand}Service`, {
        serviceName: this.naming.resourceName(`${config.appKind}-${brand}`),
        cluster: props.cluster,
        taskDefinition,
        desiredCount,
        securityGroups: [props.ecsSecurityGroup],
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        assignPublicIp: false,
        // Enable circuit breaker without rollback - allows deployment to complete
        // even if container images are not available in ECR
        // The service will be in a degraded state until images are pushed
        circuitBreaker: { enable: true, rollback: false },
      });
      this.services.set(brand, service);

      // Create target group
      const targetGroup = new elbv2.ApplicationTargetGroup(this, `${brand}TargetGroup`, {
        targetGroupName: this.naming.resourceName(`${config.appKind}-${brand}-tg`).substring(0, 32),
        vpc: props.vpc,
        port: containerPort,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: {
          path: healthCheckPath,
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
        },
        targets: [service],
      });

      // Add listener rule for this brand
      if (brand === defaultBrand) {
        // Default brand gets the catch-all rule (lowest priority)
        primaryListener.addAction(`${brand}Action`, {
          priority: 1000,
          conditions: [elbv2.ListenerCondition.pathPatterns(['/*'])],
          action: elbv2.ListenerAction.forward([targetGroup]),
        });
      } else {
        // Other brands get path-based routing
        const pathPattern = brandConfig.pathPattern ?? `/${brand}/*`;
        primaryListener.addAction(`${brand}Action`, {
          priority: brandConfig.priority ?? priority++,
          conditions: [elbv2.ListenerCondition.pathPatterns([pathPattern])],
          action: elbv2.ListenerAction.forward([targetGroup]),
        });
      }
    }

    // Create SSM parameter for ALB DNS (for cross-account CloudFront origin discovery)
    // Naming convention: /codeiqlabs/saas/{env}/{appKind}/alb-dns
    const ssmParameterPath = `/codeiqlabs/saas/${this.getStackConfig().environment}/${config.appKind}/alb-dns`;
    this.albDnsParameter = new ssm.StringParameter(this, 'AlbDnsParameter', {
      parameterName: ssmParameterPath,
      stringValue: this.alb.loadBalancerDnsName,
      description: `ALB DNS name for ${config.appKind} services`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export ALB DNS name
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      exportName: this.naming.exportName(`${config.appKind}-alb-dns`),
      description: 'ALB DNS Name',
    });

    // Export SSM parameter path
    new cdk.CfnOutput(this, 'AlbDnsSsmPath', {
      value: ssmParameterPath,
      exportName: this.naming.exportName(`${config.appKind}-alb-dns-ssm-path`),
      description: 'SSM Parameter path for ALB DNS',
    });

    // Export ALB ARN
    new cdk.CfnOutput(this, 'AlbArn', {
      value: this.alb.loadBalancerArn,
      exportName: this.naming.exportName(`${config.appKind}-alb-arn`),
      description: 'ALB ARN',
    });
  }
}
