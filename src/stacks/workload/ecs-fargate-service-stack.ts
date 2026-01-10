/**
 * ECS Fargate Service Stack for Workload Infrastructure
 *
 * Creates a shared ALB with header-based routing for multiple brand services.
 * Each brand runs as a separate ECS Fargate service behind the shared ALB.
 *
 * Architecture:
 * - Shared ALB with HTTPS listener (references cross-account ACM certificate)
 * - Header-based routing: CloudFront sends X-Forwarded-Brand and X-Forwarded-Service headers
 * - ALB listener rules match on these headers to route to the correct service
 * - Webapp services: Route based on X-Forwarded-Brand (e.g., 'savvue', 'timisly')
 * - API services: Route based on X-Forwarded-Service='api' (core API is catch-all)
 * - SSM parameter exports ALB DNS for cross-account CloudFront origin discovery
 *
 * Routing Examples:
 * - https://app.savvue.com → CloudFront → ALB (X-Forwarded-Brand: savvue, X-Forwarded-Service: webapp) → savvue-webapp
 * - https://app.timisly.com → CloudFront → ALB (X-Forwarded-Brand: timisly, X-Forwarded-Service: webapp) → timisly-webapp
 * - https://api.savvue.com → CloudFront → ALB (X-Forwarded-Service: api) → core-api
 *
 * @example
 * ```typescript
 * new EcsFargateServiceStack(app, 'Frontend', {
 *   stackConfig: {
 *     project: 'MyProject',
 *     environment: 'nprd',
 *     region: 'us-east-1',
 *     accountId: '123456789012',
 *     owner: 'MyCompany',
 *     company: 'MyCompany',
 *   },
 *   vpc: vpcStack.vpc,
 *   cluster: clusterStack.cluster,
 *   albSecurityGroup: vpcStack.albSecurityGroup,
 *   ecsSecurityGroup: vpcStack.ecsSecurityGroup,
 *   serviceConfig: {
 *     appKind: 'frontend',
 *     brands: ['acme', 'globex', 'initech'],
 *     certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/xxx',
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
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Brand service configuration
 */
export interface BrandServiceConfig {
  /**
   * Brand name (e.g., 'acme', 'globex')
   */
  brand: string;

  /**
   * Path pattern for routing (e.g., '/acme/*')
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
   * Application kind - the service name from manifest (e.g., 'frontend', 'api')
   * Used for SSM parameter naming: /{company}/{project}/{env}/{appKind}/alb-dns
   * This value comes from services[].name in the manifest
   */
  appKind: string;

  /**
   * Optional service name used for resource naming
   * Defaults to appKind if not provided
   */
  serviceName?: string;

  /**
   * List of brands to deploy services for
   * Each brand gets its own ECS service with path-based routing
   */
  brands: string[];

  /**
   * Service type used for naming logic
   * Determines whether names are brand-scoped (web) or single-scope (api/worker)
   */
  serviceType: 'webapp' | 'api' | 'worker';

  /**
   * ACM certificate ARN for ALB HTTPS
   * Must be in the same region as the ALB
   * If not provided, ALB will use HTTP only (suitable when CloudFront handles SSL)
   */
  certificateArn?: string;

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

  /**
   * Stripe price IDs as plain environment variables (not secrets)
   * For API services, all brand price IDs are injected
   * For webapp services, only the specific brand's prices are injected
   */
  stripePrices?: EcsStripePriceConfig;
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
   * Map of database URL secrets keyed by identifier (e.g., core, brand)
   * Injected as DATABASE_URL_{KEY.toUpperCase()}
   */
  databaseUrlSecretArns?: Record<string, string>;

  /**
   * @deprecated Use stripeSecretKeySecretArns instead for multi-brand support
   * Stripe secret key secret ARN
   * Injected as STRIPE_SECRET_KEY environment variable
   */
  stripeSecretKeySecretArn?: string;

  /**
   * @deprecated Use stripeWebhookSecretArns instead for multi-brand support
   * Stripe webhook signing secret ARN
   * Injected as STRIPE_WEBHOOK_SECRET environment variable
   */
  stripeWebhookSecretArn?: string;

  /**
   * @deprecated Use stripePublishableKeySecretArns instead for multi-brand support
   * Stripe publishable key secret ARN
   * Injected as STRIPE_PUBLISHABLE_KEY environment variable
   */
  stripePublishableKeySecretArn?: string;

  /**
   * Map of brand name to Stripe secret key secret ARN
   * Injected as STRIPE_SECRET_KEY_{BRAND.toUpperCase()} environment variables
   */
  stripeSecretKeySecretArns?: Record<string, string>;

  /**
   * Map of brand name to Stripe webhook secret ARN
   * Injected as STRIPE_WEBHOOK_SECRET_{BRAND.toUpperCase()} environment variables
   */
  stripeWebhookSecretArns?: Record<string, string>;

  /**
   * Map of brand name to Stripe publishable key secret ARN
   * Injected as STRIPE_PUBLISHABLE_KEY_{BRAND.toUpperCase()} environment variables
   */
  stripePublishableKeySecretArns?: Record<string, string>;

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
 * Stripe price configuration for ECS containers (non-secret environment variables)
 * Price IDs are public identifiers and don't need to be stored as secrets
 */
export interface EcsStripePriceConfig {
  /**
   * Map of brand name to monthly price ID
   * Injected as STRIPE_PRICE_ID_MONTHLY_{BRAND.toUpperCase()} environment variables
   */
  monthlyPriceIds?: Record<string, string>;

  /**
   * Map of brand name to annual price ID
   * Injected as STRIPE_PRICE_ID_ANNUAL_{BRAND.toUpperCase()} environment variables
   */
  annualPriceIds?: Record<string, string>;
}

/**
 * Props for EcsFargateServiceStack
 */
export interface EcsFargateServiceStackProps extends BaseStackProps {
  /**
   * Optional PascalCase component name for stack naming.
   * Defaults to appKind if not provided.
   */
  componentName?: string;

  /**
   * VPC where services will be deployed.
   * If not provided, will be imported from SSM using convention:
   * /codeiqlabs/saas/{env}/vpc/id
   */
  vpc?: ec2.IVpc;

  /**
   * ECS cluster for the services
   */
  cluster: ecs.ICluster;

  /**
   * Security group for the ALB.
   * If not provided, will be imported from SSM using convention:
   * /codeiqlabs/saas/{env}/alb/security-group-id
   */
  albSecurityGroup?: ec2.ISecurityGroup;

  /**
   * Security group for ECS tasks.
   * If not provided, will be imported from SSM using convention:
   * /codeiqlabs/saas/{env}/vpc/ecs-security-group-id
   */
  ecsSecurityGroup?: ec2.ISecurityGroup;

  /**
   * Service configuration
   */
  serviceConfig: EcsFargateServiceConfig;

  /**
   * Pre-created ECR repositories keyed by brand name
   * If provided, these repositories will be used instead of creating new ones
   * This allows ECR repositories to be created in a separate stack for persistence
   */
  ecrRepositories?: Record<string, ecr.IRepository>;
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
  public readonly albDnsParameter!: ssm.IStringParameter;

  constructor(scope: Construct, id: string, props: EcsFargateServiceStackProps) {
    const component =
      props.componentName ?? props.serviceConfig.serviceName ?? props.serviceConfig.appKind;
    super(scope, id, component, props);

    const config = props.serviceConfig;
    const serviceId = config.appKind;
    const serviceLabel = config.serviceName ?? config.appKind;
    const defaultContainerPort = config.defaultContainerPort ?? 3000;
    const defaultHealthCheckPath = config.defaultHealthCheckPath ?? '/health';
    const defaultDesiredCount = config.defaultDesiredCount ?? 1;
    const defaultCpu = config.defaultCpu ?? 256;
    const defaultMemoryMiB = config.defaultMemoryMiB ?? 512;
    const logRetentionDays = config.logRetentionDays ?? 30;
    const isWebService = config.serviceType === 'webapp';
    const envName = this.getStackConfig().environment;
    const isProdEnv = envName === 'prod';

    console.log(`[EcsFargateServiceStack] Constructor called for ${id}`);
    console.log(
      `[EcsFargateServiceStack] serviceId=${serviceId}, serviceLabel=${serviceLabel}, envName=${envName}`,
    );
    console.log(`[EcsFargateServiceStack] brands=${config.brands.join(',')}`);
    console.log(
      `[EcsFargateServiceStack] stack.account=${this.account}, stack.region=${this.region}`,
    );
    console.log(`[EcsFargateServiceStack] props.env=`, props.env);

    // SSM parameter prefix for importing from customization-aws
    const ssmPrefix = `/codeiqlabs/saas/${envName}`;
    console.log(`[EcsFargateServiceStack] ssmPrefix=${ssmPrefix}`);

    // Import VPC from SSM if not provided
    const vpc =
      props.vpc ??
      ec2.Vpc.fromLookup(this, 'ImportedVpc', {
        vpcId: ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/vpc/id`),
      });

    // Import security groups from SSM if not provided
    const albSecurityGroup =
      props.albSecurityGroup ??
      ec2.SecurityGroup.fromSecurityGroupId(
        this,
        'ImportedAlbSg',
        ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/alb/security-group-id`),
      );

    const ecsSecurityGroup =
      props.ecsSecurityGroup ??
      ec2.SecurityGroup.fromSecurityGroupId(
        this,
        'ImportedEcsSg',
        ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/vpc/ecs-security-group-id`),
      );

    const secretFromArn = (id: string, secretArn: string, field?: string) => {
      const secret = secretsmanager.Secret.fromSecretCompleteArn(this, id, secretArn);
      return field
        ? ecs.Secret.fromSecretsManager(secret, field)
        : ecs.Secret.fromSecretsManager(secret);
    };

    // Import ALB and HTTPS listener from customization-aws via SSM
    const albArnPath = `${ssmPrefix}/alb/arn`;
    console.log(`[EcsFargateServiceStack] Looking up SSM parameter: ${albArnPath}`);
    const albArn = ssm.StringParameter.valueFromLookup(this, albArnPath);
    console.log(`[EcsFargateServiceStack] ALB ARN from SSM: ${albArn}`);

    const albDnsName = ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/alb/dns-name`);
    const albCanonicalHostedZoneId = ssm.StringParameter.valueFromLookup(
      this,
      `${ssmPrefix}/alb/canonical-hosted-zone-id`,
    );
    const httpsListenerArn = ssm.StringParameter.valueFromLookup(
      this,
      `${ssmPrefix}/alb/https-listener-arn`,
    );

    console.log(`[EcsFargateServiceStack] ssmPrefix=${ssmPrefix}`);
    console.log(`[EcsFargateServiceStack] albArn=${albArn}, albDnsName=${albDnsName}`);

    this.alb = elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(
      this,
      'ImportedAlb',
      {
        loadBalancerArn: albArn,
        loadBalancerDnsName: albDnsName,
        loadBalancerCanonicalHostedZoneId: albCanonicalHostedZoneId,
        securityGroupId: albSecurityGroup.securityGroupId,
      },
    );

    // Import HTTPS listener (HTTP listener removed - HTTPS only)
    const httpsListener = elbv2.ApplicationListener.fromApplicationListenerAttributes(
      this,
      'ImportedHttpsListener',
      {
        listenerArn: httpsListenerArn,
        securityGroup: albSecurityGroup,
      },
    );

    // Create ECS task execution role (shared across all services)
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: this.naming.iamRoleName(`${serviceLabel}-task-exec`),
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
      if (secretsConfig.databaseUrlSecretArns) {
        secretArns.push(...Object.values(secretsConfig.databaseUrlSecretArns));
      }
      // Legacy single Stripe secrets (deprecated)
      if (secretsConfig.stripeSecretKeySecretArn)
        secretArns.push(secretsConfig.stripeSecretKeySecretArn);
      if (secretsConfig.stripeWebhookSecretArn)
        secretArns.push(secretsConfig.stripeWebhookSecretArn);
      if (secretsConfig.stripePublishableKeySecretArn)
        secretArns.push(secretsConfig.stripePublishableKeySecretArn);
      // Brand-specific Stripe secrets
      if (secretsConfig.stripeSecretKeySecretArns) {
        secretArns.push(...Object.values(secretsConfig.stripeSecretKeySecretArns));
      }
      if (secretsConfig.stripeWebhookSecretArns) {
        secretArns.push(...Object.values(secretsConfig.stripeWebhookSecretArns));
      }
      if (secretsConfig.stripePublishableKeySecretArns) {
        secretArns.push(...Object.values(secretsConfig.stripePublishableKeySecretArns));
      }
      if (secretsConfig.authSecretArn) secretArns.push(secretsConfig.authSecretArn);
      if (secretsConfig.googleOAuthSecretArns) {
        secretArns.push(...Object.values(secretsConfig.googleOAuthSecretArns));
      }

      const uniqueSecretArns = Array.from(new Set(secretArns));

      if (uniqueSecretArns.length > 0) {
        taskExecutionRole.addToPolicy(
          new iam.PolicyStatement({
            sid: 'AllowSecretsManagerRead',
            effect: iam.Effect.ALLOW,
            actions: ['secretsmanager:GetSecretValue'],
            resources: uniqueSecretArns,
          }),
        );
      }
    }

    // Create ECS task role (shared across all services)
    const taskRole = new iam.Role(this, 'TaskRole', {
      roleName: this.naming.iamRoleName(`${serviceLabel}-task`),
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Create services for each brand
    // Assign different priority ranges based on service type to avoid conflicts
    // when multiple service types share the same ALB listener:
    // - webapp: 1-99 (header-based routing on X-Forwarded-Brand)
    // - api: 100-199 (header-based routing on X-Forwarded-Service)
    // - worker: 200-299 (if needed in future)
    // Note: No catch-all rules needed - CloudFront always sends headers
    const priorityOffset =
      config.serviceType === 'webapp' ? 0 : config.serviceType === 'api' ? 100 : 200;
    let priority = 1 + priorityOffset;
    for (const brand of config.brands) {
      const brandConfig = config.brandConfigs?.[brand] ?? {};
      const containerPort = brandConfig.containerPort ?? defaultContainerPort;
      const healthCheckPath = brandConfig.healthCheckPath ?? defaultHealthCheckPath;
      const desiredCount = brandConfig.desiredCount ?? defaultDesiredCount;
      const cpu = brandConfig.cpu ?? defaultCpu;
      const memoryMiB = brandConfig.memoryMiB ?? defaultMemoryMiB;
      // Always use brand name for resource naming to ensure uniqueness
      // This prevents concurrent task definition creation errors when multiple brands
      // are deployed in the same stack (e.g., core, savvue, equitrio for API services)
      const resourceBrand = brand;

      // Use pre-created ECR repository if provided, otherwise create one
      let repository: ecr.IRepository;
      if (props.ecrRepositories?.[brand]) {
        repository = props.ecrRepositories[brand];
      } else {
        repository = new ecr.Repository(this, `${brand}Repository`, {
          repositoryName: this.naming
            .resourceName(serviceId, {
              brand: resourceBrand,
            })
            .toLowerCase(),
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          lifecycleRules: [
            {
              maxImageCount: 10,
              description: 'Keep only 10 images',
            },
          ],
        });
      }
      this.repositories.set(brand, repository);

      // Create CloudWatch log group
      // Always use brand name for log groups to ensure uniqueness
      const logGroup = new logs.LogGroup(this, `${brand}LogGroup`, {
        logGroupName: `/ecs/${this.naming.resourceName(serviceId, {
          brand: brand,
        })}`,
        retention: logRetentionDays,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      // Create task definition
      const taskDefinition = new ecs.FargateTaskDefinition(this, `${brand}TaskDef`, {
        family: this.naming.resourceName(serviceId, {
          brand: resourceBrand,
        }),
        cpu,
        memoryLimitMiB: memoryMiB,
        executionRole: taskExecutionRole,
        taskRole,
      });

      // Build secrets map for container
      const containerSecrets: Record<string, ecs.Secret> = {};
      if (secretsConfig) {
        // For API services, inject DATABASE_URL_CORE for all APIs
        // Brand APIs also need DATABASE_URL_{BRAND} for their brand-specific database
        if (config.appKind === 'api') {
          const coreDbArn = secretsConfig.databaseUrlSecretArns?.['core'];
          if (coreDbArn) {
            // All API services need DATABASE_URL_CORE for the core database
            containerSecrets['DATABASE_URL_CORE'] = secretFromArn(
              `${brand}CoreDatabaseUrlSecret`,
              coreDbArn,
            );
          }
          // Brand-specific APIs also need DATABASE_URL_{BRAND} for their brand database
          if (brand !== 'core') {
            const brandDbArn = secretsConfig.databaseUrlSecretArns?.[brand];
            if (brandDbArn) {
              containerSecrets[`DATABASE_URL_${brand.toUpperCase()}`] = secretFromArn(
                `${brand}BrandDatabaseUrlSecret`,
                brandDbArn,
              );
            }
          }
        } else {
          // For non-API services (webapp), use the original DATABASE_URL pattern
          if (secretsConfig.databaseUrlSecretArn) {
            containerSecrets['DATABASE_URL'] = secretFromArn(
              `${brand}DatabaseUrlSecret`,
              secretsConfig.databaseUrlSecretArn,
            );
          }
        }
        // Legacy single Stripe secrets (deprecated - kept for backward compatibility)
        if (secretsConfig.stripeSecretKeySecretArn) {
          containerSecrets['STRIPE_SECRET_KEY'] = secretFromArn(
            `${brand}StripeSecretKeySecret`,
            secretsConfig.stripeSecretKeySecretArn,
          );
        }
        if (secretsConfig.stripeWebhookSecretArn) {
          containerSecrets['STRIPE_WEBHOOK_SECRET'] = secretFromArn(
            `${brand}StripeWebhookSecret`,
            secretsConfig.stripeWebhookSecretArn,
          );
        }
        if (secretsConfig.stripePublishableKeySecretArn) {
          containerSecrets['STRIPE_PUBLISHABLE_KEY'] = secretFromArn(
            `${brand}StripePublishableKeySecret`,
            secretsConfig.stripePublishableKeySecretArn,
          );
        }

        // Brand-specific Stripe secrets
        // For API services (especially core API), inject ALL brand Stripe secrets
        // For webapp services, only inject the specific brand's secrets
        const stripeBrands =
          config.appKind === 'api'
            ? Object.keys(secretsConfig.stripeSecretKeySecretArns ?? {})
            : [brand];

        for (const stripeBrand of stripeBrands) {
          const secretKeyArn = secretsConfig.stripeSecretKeySecretArns?.[stripeBrand];
          if (secretKeyArn) {
            containerSecrets[`STRIPE_SECRET_KEY_${stripeBrand.toUpperCase()}`] = secretFromArn(
              `${brand}${stripeBrand}StripeSecretKeySecret`,
              secretKeyArn,
            );
          }

          const webhookSecretArn = secretsConfig.stripeWebhookSecretArns?.[stripeBrand];
          if (webhookSecretArn) {
            containerSecrets[`STRIPE_WEBHOOK_SECRET_${stripeBrand.toUpperCase()}`] = secretFromArn(
              `${brand}${stripeBrand}StripeWebhookSecret`,
              webhookSecretArn,
            );
          }

          const publishableKeyArn = secretsConfig.stripePublishableKeySecretArns?.[stripeBrand];
          if (publishableKeyArn) {
            containerSecrets[`STRIPE_PUBLISHABLE_KEY_${stripeBrand.toUpperCase()}`] = secretFromArn(
              `${brand}${stripeBrand}StripePublishableKeySecret`,
              publishableKeyArn,
            );
          }
        }
        if (secretsConfig.authSecretArn) {
          containerSecrets['AUTH_SECRET'] = secretFromArn(
            `${brand}AuthSecret`,
            secretsConfig.authSecretArn,
          );
        }
        // Add Google OAuth secrets (per brand)
        const googleSecretBrands =
          config.appKind === 'api'
            ? Object.keys(secretsConfig.googleOAuthSecretArns ?? {})
            : [brand];

        for (const googleBrand of googleSecretBrands) {
          const googleSecretArn = secretsConfig.googleOAuthSecretArns?.[googleBrand];
          if (!googleSecretArn) continue;

          containerSecrets[`AUTH_GOOGLE_ID_${googleBrand.toUpperCase()}`] = secretFromArn(
            `${brand}${googleBrand}GoogleOAuthSecret`,
            googleSecretArn,
            'clientId',
          );
          containerSecrets[`AUTH_GOOGLE_SECRET_${googleBrand.toUpperCase()}`] = secretFromArn(
            `${brand}${googleBrand}GoogleOAuthSecretSecret`,
            googleSecretArn,
            'clientSecret',
          );
        }
      }

      // Add container to task definition
      const marketingHost = isProdEnv ? `${brand}.com` : `nprd.${brand}.com`;
      const webappHost = isProdEnv ? `app.${brand}.com` : `nprd-app.${brand}.com`;
      const apiHost = isProdEnv ? `api.${brand}.com` : `nprd-api.${brand}.com`;

      const containerEnv: Record<string, string> = {
        BRAND: brand,
        NEXT_PUBLIC_BRAND: brand,
        NODE_ENV: isProdEnv ? 'production' : 'development',
        NEXT_PUBLIC_ENV: envName,
      };

      if (isWebService) {
        containerEnv.NEXT_PUBLIC_APP_URL = `https://${marketingHost}`;
        containerEnv.NEXT_PUBLIC_BASE_DOMAIN = marketingHost;
        containerEnv.NEXT_PUBLIC_WEBAPP_URL = `https://${webappHost}`;
        containerEnv.EXPO_PUBLIC_API_URL = `https://${apiHost}`;
      }

      // Add Stripe price IDs as environment variables (non-secret, public identifiers)
      const stripePricesConfig = config.stripePrices;
      if (stripePricesConfig) {
        // For API services (especially core API), inject ALL brand price IDs
        // For webapp services, only inject the specific brand's prices
        const priceBrands =
          config.appKind === 'api'
            ? Object.keys(stripePricesConfig.monthlyPriceIds ?? {})
            : [brand];

        for (const priceBrand of priceBrands) {
          const monthlyPriceId = stripePricesConfig.monthlyPriceIds?.[priceBrand];
          if (monthlyPriceId) {
            containerEnv[`STRIPE_PRICE_ID_MONTHLY_${priceBrand.toUpperCase()}`] = monthlyPriceId;
          }

          const annualPriceId = stripePricesConfig.annualPriceIds?.[priceBrand];
          if (annualPriceId) {
            containerEnv[`STRIPE_PRICE_ID_ANNUAL_${priceBrand.toUpperCase()}`] = annualPriceId;
          }
        }
      }

      taskDefinition.addContainer(`${brand}Container`, {
        containerName: brand,
        image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
        portMappings: [{ containerPort }],
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: brand,
          logGroup,
        }),
        environment: containerEnv,
        secrets: Object.keys(containerSecrets).length > 0 ? containerSecrets : undefined,
      });

      // Create Fargate service
      // Always use actual brand name for service names to ensure uniqueness
      const service = new ecs.FargateService(this, `${brand}Service`, {
        serviceName: this.naming.resourceName(serviceId, {
          brand: brand,
        }),
        cluster: props.cluster,
        taskDefinition,
        desiredCount,
        securityGroups: [ecsSecurityGroup],
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        assignPublicIp: false,
        // Enable circuit breaker without rollback - allows deployment to complete
        // even if container images are not available in ECR
        // The service will be in a degraded state until images are pushed
        circuitBreaker: { enable: true, rollback: false },
      });
      this.services.set(brand, service);

      // Create target group
      // Always use actual brand name for target groups to ensure uniqueness
      const targetGroup = new elbv2.ApplicationTargetGroup(this, `${brand}TargetGroup`, {
        targetGroupName: this.naming
          .resourceName(`${serviceId}-tg`, {
            brand: brand,
          })
          .substring(0, 32),
        vpc,
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

      // Add listener rule for this brand (HTTPS only)
      // Use header-based routing instead of path-based routing
      // CloudFront sends X-Forwarded-Brand and X-Forwarded-Service headers
      // This allows multiple CloudFront distributions to share the same ALB origin

      // For webapp services: Match on X-Forwarded-Brand header
      // For api services: Match on X-Forwarded-Service header (since API is shared across brands)
      const conditions: elbv2.ListenerCondition[] = [];

      if (config.serviceType === 'webapp') {
        // Webapp: Route based on brand (e.g., X-Forwarded-Brand: savvue)
        conditions.push(
          elbv2.ListenerCondition.httpHeader('X-Forwarded-Brand', [brand]),
          elbv2.ListenerCondition.httpHeader('X-Forwarded-Service', ['webapp']),
        );
      } else if (config.serviceType === 'api') {
        // API: Route based on service type and optionally brand
        if (brand === 'core') {
          // Core API: Match only on service type (catch-all for API requests)
          conditions.push(elbv2.ListenerCondition.httpHeader('X-Forwarded-Service', ['api']));
        } else {
          // Brand-specific API: Match on both service type and brand
          conditions.push(
            elbv2.ListenerCondition.httpHeader('X-Forwarded-Brand', [brand]),
            elbv2.ListenerCondition.httpHeader('X-Forwarded-Service', ['api']),
          );
        }
      }

      // Add the listener rule
      httpsListener.addAction(`${brand}Action`, {
        priority: brandConfig.priority ?? priority++,
        conditions,
        action: elbv2.ListenerAction.forward([targetGroup]),
      });
    }

    // Create SSM parameter for ALB DNS (for cross-account CloudFront origin discovery)
    // Pattern: brand-first for webapp: /{company}/{project}/{brand}/{env}/{appKind}/alb-dns
    // Non-webapp: /{company}/{project}/{env}/{appKind}/alb-dns
    const brandScopedPaths: string[] = [];
    let primarySsmPath: string | undefined;

    if (isWebService) {
      for (const brand of config.brands) {
        const path = this.naming.ssmParameterName(config.appKind, 'alb-dns', { brand });
        brandScopedPaths.push(path);
        const param = new ssm.StringParameter(this, `AlbDnsParameter${brand}`, {
          parameterName: path,
          stringValue: this.alb.loadBalancerDnsName,
          description: `ALB DNS name for ${config.appKind} services (${brand})`,
          tier: ssm.ParameterTier.STANDARD,
        });
        if (!this.albDnsParameter) {
          this.albDnsParameter = param;
          primarySsmPath = path;
        }
      }
    } else {
      primarySsmPath = this.naming.ssmParameterName(config.appKind, 'alb-dns');
      this.albDnsParameter = new ssm.StringParameter(this, 'AlbDnsParameter', {
        parameterName: primarySsmPath,
        stringValue: this.alb.loadBalancerDnsName,
        description: `ALB DNS name for ${config.appKind} services`,
        tier: ssm.ParameterTier.STANDARD,
      });
    }

    // Export ALB DNS name
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      exportName: this.naming.exportName(`${config.appKind}-alb-dns`),
      description: 'ALB DNS Name',
    });

    // Export SSM parameter paths
    new cdk.CfnOutput(this, 'AlbDnsSsmPath', {
      value: primarySsmPath ?? '',
      exportName: this.naming.exportName(`${config.appKind}-alb-dns-ssm-path`),
      description: 'SSM Parameter path for ALB DNS',
    });
    if (brandScopedPaths.length > 0) {
      new cdk.CfnOutput(this, 'AlbDnsSsmPathsBrandScoped', {
        value: brandScopedPaths.join(','),
        exportName: this.naming.exportName(`${config.appKind}-alb-dns-ssm-paths-branded`),
        description: 'Brand-scoped SSM Parameter paths for ALB DNS',
      });
    }

    // Export ALB ARN
    new cdk.CfnOutput(this, 'AlbArn', {
      value: this.alb.loadBalancerArn,
      exportName: this.naming.exportName(`${config.appKind}-alb-arn`),
      description: 'ALB ARN',
    });
  }
}
