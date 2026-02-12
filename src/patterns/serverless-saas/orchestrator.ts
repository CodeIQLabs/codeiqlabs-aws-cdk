/**
 * Serverless SaaS Pattern Orchestrator
 *
 * Orchestrates infrastructure, edge, and workload stacks for the serverless SaaS pattern.
 * Extracted from ComponentOrchestrator to isolate pattern-specific logic.
 *
 * **Architecture:**
 * - Edge: CloudFront → S3 (webapp/marketing), CloudFront → API Gateway (APIs)
 * - Workload: Lambda, API Gateway, DynamoDB, EventBridge, ECR, S3, Secrets Manager
 *
 * **Triggered by manifest sections:** saasWorkload, saasEdge, infrastructure, domains
 */

import type { CdkApplication } from '../../application/cdk-application';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';
import { OrchestrationError } from '../../application/orchestration/base-orchestrator';
import { ResourceNaming } from '@codeiqlabs/aws-utils';

// Edge stacks
import {
  SubdomainZoneStack,
  ApiGatewayDomainStack,
  WorkloadParamsStack,
  RootDomainStack,
  AcmAndWafStack,
  CloudFrontVpcOriginStack,
  DnsRecordsStack,
  StaticWebAppStack,
} from './stacks/edge';

// Workload stacks
import {
  SaasSecretsStack,
  DynamoDBStack,
  EcrRepositoryStack,
  LambdaFunctionStack,
  ApiGatewayStack,
  EventBridgeStack,
  ProductSeedStack,
  EventHandlerLambdaStack,
  ScheduledJobLambdaStack,
  TrialExpiryStack,
} from './stacks/workload';

/**
 * Context passed from ComponentOrchestrator to pattern orchestrators
 */
export interface OrchestrationContext {
  /** CDK application instance */
  app: CdkApplication;
  /** Parsed manifest configuration */
  config: UnifiedAppConfig;
  /** Environment filter from CDK context (e.g., -c targetEnv=nprd) */
  targetEnvFilter?: string;
  /** Resource naming utility for management account */
  naming: ResourceNaming;
  /** Stack name options for management account */
  mgmtStackNameOptions?: { skipEnvironment: boolean };
  /** Naming configuration */
  company: string;
  project: string;
  owner: string;
  /** Primary deployment environment */
  primaryEnv: { account: string; region: string };
  /** Deployment target details */
  deploymentAccountId: string;
  deploymentRegion: string;
}

/**
 * Serverless SaaS Pattern Orchestrator
 *
 * Creates infrastructure, edge, and workload stacks for the serverless SaaS pattern.
 * This includes SubdomainZone, API Gateway domains, CloudFront distributions,
 * Lambda functions, DynamoDB tables, EventBridge, and S3 static hosting.
 */
export class ServerlessSaasOrchestrator {
  /**
   * Orchestrate all serverless SaaS infrastructure
   */
  orchestrate(context: OrchestrationContext): void {
    this.createInfrastructureStacks(context);
    this.createDomainStacks(context);
    this.createWorkloadStacks(context);
  }

  /**
   * Infrastructure components (customization-aws)
   * Creates SubdomainZone, ApiGatewayDomain, and WorkloadParams stacks for workload accounts
   */
  private createInfrastructureStacks(context: OrchestrationContext): void {
    const { app, config, targetEnvFilter, company, project, owner, deploymentRegion } = context;

    const infrastructureConfig = (config as any).infrastructure;
    const targetEnvNames = infrastructureConfig?.targetEnvironments || [];
    if (!infrastructureConfig || targetEnvNames.length === 0) return;

    const commonParamsConfig = infrastructureConfig.commonParams || {};

    // Get management account ID for common params
    const mgmtEnv = config.environments['mgmt'];
    const managementAccountId = mgmtEnv?.accountId;

    if (!managementAccountId) {
      throw new OrchestrationError(
        'Management account ID is required for infrastructure stacks. Add mgmt environment to environments section with accountId.',
        'infrastructure',
        new Error('Missing management account ID'),
      );
    }

    for (const envName of targetEnvNames) {
      // Skip if environment filter is set and doesn't match
      if (targetEnvFilter && envName !== targetEnvFilter) {
        console.log(
          `[ServerlessSaasOrchestrator] Skipping infrastructure for environment: ${envName}`,
        );
        continue;
      }

      const envConfig = config.environments[envName];
      if (!envConfig) {
        throw new OrchestrationError(
          `Environment '${envName}' not found in environments section`,
          'infrastructure',
          new Error(`Missing environment: ${envName}`),
        );
      }

      const envNaming = new ResourceNaming({
        company,
        project,
        environment: envName,
        region: envConfig.region,
        accountId: envConfig.accountId,
      });

      const stackConfig = {
        project,
        environment: envName,
        region: envConfig.region,
        accountId: envConfig.accountId,
        owner,
        company,
      };

      const envEnv = {
        account: envConfig.accountId,
        region: envConfig.region,
      };

      try {
        // 1. Create Subdomain Zone Stack (Cross-account subdomain delegation)
        // Creates delegated subdomain zones ONLY (e.g., nprd.savvue.com, prod.savvue.com)
        // Uses CrossAccountZoneDelegationRecord to auto-create NS records in parent zone
        const subdomainZoneStack = new SubdomainZoneStack(
          app,
          envNaming.stackName('SubdomainZone'),
          {
            stackConfig,
            config: config as any,
            managementAccountId,
            env: envEnv,
          },
        );

        // 2. Create API Gateway Domain Stack (if saasEdge has originType: apiGateway)
        // Creates ACM certificate, API Gateway DomainName, and A records
        // Does NOT create ApiMapping - that's done by saas-aws ApiGatewayStack
        const saasEdgeConfig = (config as any).saasEdge as any[] | undefined;
        if (saasEdgeConfig) {
          // Find domains that have API distributions with originType: apiGateway
          const apiGatewayDomains = saasEdgeConfig
            .filter((edge: any) =>
              edge.distributions?.some(
                (dist: any) => dist.type === 'api' && dist.originType === 'apiGateway',
              ),
            )
            .map((edge: any) => edge.domain);

          if (apiGatewayDomains.length > 0) {
            const apiGwDomainStack = new ApiGatewayDomainStack(
              app,
              envNaming.stackName('ApiGwDomain'),
              {
                stackConfig,
                brandDomains: apiGatewayDomains,
                subdomainZones: subdomainZoneStack.subdomainZones,
                env: envEnv,
              },
            );
            apiGwDomainStack.addDependency(subdomainZoneStack);
          }
        }

        // 3. Create Workload Params Stack (if commonParams.accountIds is true)
        if (commonParamsConfig.accountIds) {
          // Construct delegation role ARNs for domains with createDelegationRole: true
          const delegationRoleArns: Record<string, string> = {};
          const registeredDomains = (config.domains as any)?.registeredDomains as any[] | undefined;
          if (registeredDomains) {
            for (const domain of registeredDomains) {
              if (domain.createDelegationRole) {
                const roleName = `Route53-Delegation-${domain.name.replace(/\./g, '-')}`;
                delegationRoleArns[domain.name] =
                  `arn:aws:iam::${managementAccountId}:role/${roleName}`;
              }
            }
          }

          new WorkloadParamsStack(app, envNaming.stackName('WorkloadParams'), {
            stackConfig,
            managementAccountId,
            managementRegion: deploymentRegion,
            paramsConfig: {
              accountIds: true,
            },
            delegationRoleArns:
              Object.keys(delegationRoleArns).length > 0 ? delegationRoleArns : undefined,
            env: envEnv,
          });
        }
      } catch (error) {
        throw new OrchestrationError(
          `Failed to create infrastructure stacks for environment ${envName}`,
          'infrastructure',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }

  /**
   * Domain management stacks (management account)
   * Creates RootDomain, AcmAndWaf, CloudFront, and DnsRecords stacks
   */
  private createDomainStacks(context: OrchestrationContext): void {
    const {
      app,
      config,
      naming,
      company,
      project,
      owner,
      deploymentAccountId,
      deploymentRegion,
      primaryEnv,
    } = context;

    const saasEdge = (config as any).saasEdge as any[] | undefined;
    const registeredDomains = (config.domains as any)?.registeredDomains as any[] | undefined;
    const hasDomains =
      (registeredDomains && registeredDomains.length > 0) || (saasEdge && saasEdge.length > 0);

    if (!hasDomains) return;

    const mgmtStackConfig = {
      project,
      environment: 'mgmt',
      region: deploymentRegion,
      accountId: deploymentAccountId,
      owner,
      company,
    };

    // us-east-1 environment for CloudFront resources
    const usEast1Env = {
      account: deploymentAccountId,
      region: 'us-east-1',
    };

    // Get target environments from infrastructure config
    const infrastructureConfig = (config as any).infrastructure;
    const targetEnvNames = infrastructureConfig?.targetEnvironments || [];

    try {
      // 1. RootDomainStack - creates hosted zones
      const rootDomainStack = new RootDomainStack(app, naming.stackName('RootDomain'), {
        stackConfig: mgmtStackConfig,
        config: config as any,
        env: primaryEnv,
      });

      // 2. AcmAndWafStack - creates certificates and WAF ACLs (must be in us-east-1)
      // Only create if we have saasEdge (CloudFront distributions)
      let acmWafStack: AcmAndWafStack | undefined;
      if (saasEdge && saasEdge.length > 0) {
        const acmWafNaming = new ResourceNaming({
          company,
          project,
          environment: 'mgmt',
          region: 'us-east-1',
          accountId: deploymentAccountId,
        });

        acmWafStack = new AcmAndWafStack(app, acmWafNaming.stackName('AcmAndWaf'), {
          stackConfig: { ...mgmtStackConfig, region: 'us-east-1' },
          config: config as any,
          nprdAllowedCidrs: (config.domains as any)?.nprdAllowedCidrsWaf || [],
          env: usEast1Env,
        });
        acmWafStack.addDependency(rootDomainStack);
      }

      // 3. CloudFrontVpcOriginStack - creates CloudFront distributions
      // Uses hybrid DNS delegation architecture: alb.{env}.{brand}.com
      // Origins resolve via NS delegation to workload account zones (no SSM lookups)
      const targetEnvironments = targetEnvNames.length > 0 ? targetEnvNames : ['nprd', 'prod'];

      // Only create CloudFront stack if we have saasEdge and acmWafStack
      if (saasEdge && saasEdge.length > 0 && acmWafStack) {
        const acmWafNaming = new ResourceNaming({
          company,
          project,
          environment: 'mgmt',
          region: 'us-east-1',
          accountId: deploymentAccountId,
        });

        const cloudFrontStack = new CloudFrontVpcOriginStack(
          app,
          acmWafNaming.stackName('CloudFront'),
          {
            stackConfig: { ...mgmtStackConfig, region: 'us-east-1' },
            config: config as any,
            targetEnvironments,
            // Pass WAF Web ACL ARNs for environment-based IP restriction
            prodWebAclArn: acmWafStack.prodWebAclArn,
            nprdWebAclArn: acmWafStack.nprdWebAclArn,
            env: usEast1Env,
          },
        );
        cloudFrontStack.addDependency(acmWafStack);

        // 4. DnsRecordsStack - creates DNS records pointing to CloudFront
        const dnsRecordsStack = new DnsRecordsStack(app, naming.stackName('DnsRecords'), {
          stackConfig: mgmtStackConfig,
          config: config as any,
          targetEnvironments,
          env: primaryEnv,
        });
        dnsRecordsStack.addDependency(cloudFrontStack);
      }
    } catch (error) {
      throw new OrchestrationError(
        'Failed to create Domain Management stacks',
        'domains',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Multi-environment workload components
   * Creates Secrets, DynamoDB, ECR, Lambda, API Gateway, EventBridge, S3 stacks per environment
   */
  private createWorkloadStacks(context: OrchestrationContext): void {
    const { app, config, targetEnvFilter, company, project, owner } = context;
    const environments = config.environments!;

    if (!config.environments) return;

    for (const [envName, envConfig] of Object.entries(config.environments)) {
      // Skip if environment filter is set and doesn't match
      if (targetEnvFilter && envName !== targetEnvFilter && envName !== 'mgmt') {
        console.log(
          `[ServerlessSaasOrchestrator] Skipping saasWorkload for environment: ${envName}`,
        );
        continue;
      }

      const envEnv = {
        account: envConfig.accountId,
        region: envConfig.region,
      };

      const envNaming = new ResourceNaming({
        company,
        project,
        environment: envName,
        region: envConfig.region,
        accountId: envConfig.accountId,
      });

      const stackConfig = {
        project,
        environment: envName,
        region: envConfig.region,
        accountId: envConfig.accountId,
        owner,
        company,
      };

      // ======================================================================
      // SAAS WORKLOAD - Convention-over-Configuration
      // If saasWorkload is present, derive all infrastructure from it
      // ======================================================================
      const saasWorkload = (config as any).saasWorkload as any[] | undefined;
      const defaults = (config as any).defaults;

      // Skip management environment for saasWorkload-derived infrastructure
      // saasWorkload infrastructure goes to workload accounts only
      if (saasWorkload && saasWorkload.length > 0 && envName !== 'mgmt') {
        // Derive brands and configuration from saasWorkload
        // Convention-over-configuration: lambdaApi, webappS3, marketingS3 flags

        // Brands with lambdaApi: true (Lambda + API Gateway + DynamoDB)
        const lambdaApiBrands = saasWorkload
          .filter((app: any) => app.lambdaApi === true)
          .map((app: any) => app.name);

        // Brands with webappS3: true (S3 bucket for static webapp hosting)
        const webappS3Brands = saasWorkload
          .filter((app: any) => app.webappS3 === true)
          .map((app: any) => app.name);

        // Brands with marketingS3: true (S3 bucket for marketing site hosting)
        const marketingS3Brands = saasWorkload
          .filter((app: any) => app.marketingS3 === true)
          .map((app: any) => app.name);

        // Brands with eventHandlers: true (EventBridge event handler Lambda functions)
        const eventHandlerBrands = saasWorkload
          .filter((app: any) => app.eventHandlers === true)
          .map((app: any) => app.name);

        // Brands with scheduledJobs array (scheduled background job Lambda functions)
        const scheduledJobBrands = saasWorkload
          .filter((app: any) => app.scheduledJobs && app.scheduledJobs.length > 0)
          .map((app: any) => app.name);

        // Also include brands with trialExpiryChecker for ECR repo creation
        const trialExpiryEcrBrands = saasWorkload
          .filter((app: any) => app.trialExpiryChecker)
          .map((app: any) => app.name);
        for (const brand of trialExpiryEcrBrands) {
          if (!scheduledJobBrands.includes(brand)) {
            scheduledJobBrands.push(brand);
          }
        }

        // Brands with any non-marketing services (for DynamoDB/Secrets creation)
        const nonMarketingBrands = saasWorkload
          .filter((app: any) => app.lambdaApi === true)
          .map((app: any) => app.name);

        // Get Lambda defaults from manifest
        const lambdaDefaults = defaults?.lambda;

        // Track stacks for dependencies
        let dynamodbStack: DynamoDBStack | undefined;
        let ecrStack: EcrRepositoryStack | undefined;

        // 1. Secrets Stack (for application secrets - no database URLs needed with DynamoDB)
        if (nonMarketingBrands.length > 0) {
          try {
            // Collect which brands need each secret type from manifest
            const oauthBrands = saasWorkload
              .filter((app: any) => app.domain)
              .map((app: any) => app.name);
            const secretTypeToBrands: Record<string, string[]> = {};
            // Shared secret types are not per-brand — just track that they're declared
            const sharedSecretTypeSet = new Set(['auth-secret']);

            for (const app of saasWorkload) {
              const brandSecrets: string[] = app.secrets ?? [];
              for (const secretType of brandSecrets) {
                if (!secretTypeToBrands[secretType]) {
                  secretTypeToBrands[secretType] = [];
                }

                // Shared secrets: just mark as present (no brand expansion)
                if (sharedSecretTypeSet.has(secretType)) {
                  // Presence is enough — shared secrets don't track brands
                  continue;
                }

                // For core + OAuth secrets, create for all brands with domains
                if (
                  app.name === 'core' &&
                  ['google-oauth', 'apple-oauth', 'microsoft-oauth'].includes(secretType)
                ) {
                  for (const brand of oauthBrands) {
                    if (!secretTypeToBrands[secretType].includes(brand)) {
                      secretTypeToBrands[secretType].push(brand);
                    }
                  }
                } else {
                  if (!secretTypeToBrands[secretType].includes(app.name)) {
                    secretTypeToBrands[secretType].push(app.name);
                  }
                }
              }
            }

            // Build secret items from collected types
            const secretItems: any[] = [];

            // Add shared secrets declared in manifest (prefixed with shared/)
            if (secretTypeToBrands['auth-secret']) {
              secretItems.push({
                key: 'shared/auth-secret',
                description: 'Auth.js secret',
                generated: true,
              });
            }

            // Stripe secrets (3 secrets per brand)
            if (secretTypeToBrands['stripe']?.length) {
              secretItems.push(
                {
                  key: 'stripe-secret-key',
                  description: 'Stripe secret key',
                  perBrand: true,
                  brandsOverride: secretTypeToBrands['stripe'],
                },
                {
                  key: 'stripe-webhook-secret',
                  description: 'Stripe webhook secret',
                  perBrand: true,
                  brandsOverride: secretTypeToBrands['stripe'],
                },
                {
                  key: 'stripe-publishable-key',
                  description: 'Stripe publishable key',
                  perBrand: true,
                  brandsOverride: secretTypeToBrands['stripe'],
                },
              );
            }

            // Google OAuth
            if (secretTypeToBrands['google-oauth']?.length) {
              secretItems.push({
                key: 'google-oauth',
                description: 'Google OAuth client credentials',
                perBrand: true,
                brandsOverride: secretTypeToBrands['google-oauth'],
                jsonFields: ['clientId', 'clientSecret'],
              });
            }

            // Apple OAuth
            if (secretTypeToBrands['apple-oauth']?.length) {
              secretItems.push({
                key: 'apple-oauth',
                description: 'Apple Sign In credentials',
                perBrand: true,
                brandsOverride: secretTypeToBrands['apple-oauth'],
                jsonFields: ['clientId', 'teamId', 'keyId', 'privateKey'],
              });
            }

            // Microsoft OAuth
            if (secretTypeToBrands['microsoft-oauth']?.length) {
              secretItems.push({
                key: 'microsoft-oauth',
                description: 'Microsoft Entra ID OAuth credentials',
                perBrand: true,
                brandsOverride: secretTypeToBrands['microsoft-oauth'],
                jsonFields: ['clientId', 'clientSecret'],
              });
            }

            // Plaid
            if (secretTypeToBrands['plaid']?.length) {
              secretItems.push({
                key: 'plaid',
                description: 'Plaid API credentials',
                perBrand: true,
                brandsOverride: secretTypeToBrands['plaid'],
                jsonFields: ['clientId', 'secret', 'env', 'webhookUrl'],
              });
            }

            new SaasSecretsStack(app, envNaming.stackName('Secrets'), {
              stackConfig,
              secretsConfig: {
                recoveryWindowInDays: 7,
                brands: nonMarketingBrands,
                items: secretItems,
              },
              env: envEnv,
            });
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create Secrets stack for environment ${envName}`,
              'saasWorkload',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // 2. DynamoDB Stack (for brands with lambdaApi: true)
        if (nonMarketingBrands.length > 0) {
          try {
            const tables = nonMarketingBrands;
            const isProd = envName === 'prod';
            dynamodbStack = new DynamoDBStack(app, envNaming.stackName('DynamoDB'), {
              stackConfig,
              tables,
              pointInTimeRecovery: true,
              deletionProtection: isProd,
              env: envEnv,
            });

            // 2b. Product Seed Stack (seeds product entities into core table)
            const coreTable = dynamodbStack.tables.get('core');
            if (coreTable) {
              // Build products from saasWorkload (exclude 'core' which is not a product)
              const products = saasWorkload
                .filter((app: any) => app.name !== 'core')
                .map((app: any) => ({
                  id: app.name,
                  name: app.name.charAt(0).toUpperCase() + app.name.slice(1),
                  description: app.domain
                    ? `${app.name.charAt(0).toUpperCase() + app.name.slice(1)} platform`
                    : undefined,
                }));

              if (products.length > 0) {
                const productSeedStack = new ProductSeedStack(
                  app,
                  envNaming.stackName('ProductSeed'),
                  {
                    stackConfig,
                    products,
                    coreTable,
                    env: envEnv,
                  },
                );
                productSeedStack.addDependency(dynamodbStack);
              }

              // 2c. Trial Expiry Checker Stack
              const trialExpiryBrands = saasWorkload.filter((app) => app.trialExpiryChecker);
              if (trialExpiryBrands.length > 0 && coreTable) {
                try {
                  // Collect brand tables for Plaid connection management
                  const brandTables = saasWorkload
                    .filter((app) => app.name !== 'core' && app.lambdaApi && dynamodbStack)
                    .map((app) => {
                      const table = dynamodbStack!.tables.get(app.name);
                      return table
                        ? {
                            brand: app.name,
                            tableName: table.tableName,
                            tableArn: table.tableArn,
                          }
                        : null;
                    })
                    .filter(
                      (t): t is { brand: string; tableName: string; tableArn: string } =>
                        t !== null,
                    );

                  const trialExpiryStack = new TrialExpiryStack(
                    app,
                    envNaming.stackName('TrialExpiry'),
                    {
                      stackConfig,
                      coreTableName: coreTable.tableName,
                      coreTableArn: coreTable.tableArn,
                      brandTables,
                      env: envEnv,
                    },
                  );
                  trialExpiryStack.addDependency(dynamodbStack);
                  if (ecrStack) {
                    trialExpiryStack.addDependency(ecrStack);
                  }
                } catch (error) {
                  throw new OrchestrationError(
                    `Failed to create Trial Expiry stack for environment ${envName}`,
                    'saasWorkload',
                    error instanceof Error ? error : new Error(String(error)),
                  );
                }
              }
            }
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create DynamoDB stack for environment ${envName}`,
              'saasWorkload',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // 3. ECR Repository Stack (for Lambda container images)
        if (
          lambdaApiBrands.length > 0 ||
          eventHandlerBrands.length > 0 ||
          scheduledJobBrands.length > 0
        ) {
          try {
            ecrStack = new EcrRepositoryStack(app, envNaming.stackName('ECR'), {
              stackConfig,
              repositoryConfig: {
                webappBrands: [],
                apiBrands: lambdaApiBrands,
                eventHandlerBrands: eventHandlerBrands.length > 0 ? eventHandlerBrands : undefined,
                scheduledJobBrands: scheduledJobBrands.length > 0 ? scheduledJobBrands : undefined,
              },
              env: envEnv,
            });
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create ECR stack for environment ${envName}`,
              'saasWorkload',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // 4. Lambda Function Stack (Lambda + API Gateway + DynamoDB)
        if (lambdaApiBrands.length > 0 && dynamodbStack) {
          try {
            // Collect all brand Stripe configs for api-core
            const allBrandStripeEnvVars: Record<string, string> = {};
            for (const app of saasWorkload) {
              if (app.stripe?.[envName]) {
                const stripeConfig = app.stripe[envName];
                const brandUpper = app.name.toUpperCase();
                if (stripeConfig.priceIdMonthly) {
                  allBrandStripeEnvVars[`STRIPE_PRICE_ID_MONTHLY_${brandUpper}`] =
                    stripeConfig.priceIdMonthly;
                }
                if (stripeConfig.priceIdAnnual) {
                  allBrandStripeEnvVars[`STRIPE_PRICE_ID_ANNUAL_${brandUpper}`] =
                    stripeConfig.priceIdAnnual;
                }
              }
            }

            // Build Lambda function configs from lambdaApiBrands
            const lambdaFunctions = lambdaApiBrands.map((brand) => {
              const environment: Record<string, string> = {};

              if (brand === 'core') {
                Object.assign(environment, allBrandStripeEnvVars);
              } else {
                const brandConfig = saasWorkload.find((app: any) => app.name === brand);
                if (brandConfig?.stripe?.[envName]) {
                  const stripeConfig = brandConfig.stripe[envName];
                  const brandUpper = brand.toUpperCase();
                  if (stripeConfig.priceIdMonthly) {
                    environment[`STRIPE_PRICE_ID_MONTHLY_${brandUpper}`] =
                      stripeConfig.priceIdMonthly;
                  }
                  if (stripeConfig.priceIdAnnual) {
                    environment[`STRIPE_PRICE_ID_ANNUAL_${brandUpper}`] =
                      stripeConfig.priceIdAnnual;
                  }
                }
              }

              return {
                name: `api-${brand}`,
                ecrRepositoryName: `${brand}-api`,
                memorySize: lambdaDefaults?.memorySize ?? 1024,
                timeout: lambdaDefaults?.timeout ?? 30,
                environment: Object.keys(environment).length > 0 ? environment : undefined,
              };
            });

            // Resolve EventBridge bus name with environment placeholder
            const eventBridgeBusName = lambdaDefaults?.eventBridgeBusName
              ? (lambdaDefaults.eventBridgeBusName as string).replace('{env}', envName)
              : undefined;

            const lambdaStack = new LambdaFunctionStack(app, envNaming.stackName('Lambda'), {
              stackConfig,
              config: {
                functions: lambdaFunctions,
                eventBridgeBusName,
              },
              dynamodbTables: dynamodbStack.tables,
              env: envEnv,
            });
            lambdaStack.addDependency(dynamodbStack);
            if (ecrStack) {
              lambdaStack.addDependency(ecrStack);
            }

            // 7b. API Gateway Stack (HTTP API with routes to Lambda functions)
            try {
              const apiRoutes = lambdaApiBrands.map((brand) => ({
                path: `/${brand}/{proxy+}`,
                lambdaName: `api-${brand}`,
              }));

              // Derive CORS origins from brands with domains
              const domainsWithWebapps = saasWorkload
                .filter((app: any) => app.domain)
                .map((app: any) => app.domain as string);

              const corsOrigins: string[] = [];
              for (const domain of domainsWithWebapps) {
                corsOrigins.push(`https://app.${domain}`);
                if (envName !== 'prod') {
                  corsOrigins.push(`https://${envName}-app.${domain}`);
                }
              }

              // Get brand domains that have lambdaApi: true for API mappings
              const apiMappingDomains = saasWorkload
                .filter((app: any) => app.lambdaApi === true && app.domain)
                .map((app: any) => app.domain);

              const apiGatewayStack = new ApiGatewayStack(app, envNaming.stackName('ApiGateway'), {
                stackConfig,
                config: {
                  routes: apiRoutes,
                  corsOrigins: corsOrigins.length > 0 ? corsOrigins : undefined,
                },
                lambdaFunctions: lambdaStack.functions,
                apiMappingDomains: apiMappingDomains.length > 0 ? apiMappingDomains : undefined,
                env: envEnv,
              });
              apiGatewayStack.addDependency(lambdaStack);

              // 7c. Event Handler Lambda Stack
              let eventHandlerStack: EventHandlerLambdaStack | undefined;
              if (eventHandlerBrands.length > 0 && dynamodbStack && ecrStack) {
                try {
                  const eventBridgeBusNameForHandlers = lambdaDefaults?.eventBridgeBusName
                    ? (lambdaDefaults.eventBridgeBusName as string).replace('{env}', envName)
                    : undefined;

                  const handlers = eventHandlerBrands.map((brand) => ({
                    brand,
                    memorySize: lambdaDefaults?.memorySize ?? 1024,
                    timeout: lambdaDefaults?.timeout ?? 30,
                  }));

                  eventHandlerStack = new EventHandlerLambdaStack(
                    app,
                    envNaming.stackName('EventHandlerLambda'),
                    {
                      stackConfig,
                      handlers,
                      dynamodbTables: dynamodbStack.tables,
                      eventBridgeBusName: eventBridgeBusNameForHandlers,
                      env: envEnv,
                    },
                  );

                  eventHandlerStack.addDependency(dynamodbStack);
                  eventHandlerStack.addDependency(ecrStack);
                } catch (error) {
                  throw new OrchestrationError(
                    `Failed to create Event Handler Lambda stack for environment ${envName}`,
                    'saasWorkload',
                    error instanceof Error ? error : new Error(String(error)),
                  );
                }
              }

              // 7d. EventBridge Stack (event bus for async communication)
              try {
                const eventBridgeStack = new EventBridgeStack(
                  app,
                  envNaming.stackName('EventBridge'),
                  {
                    stackConfig,
                    config: {
                      eventRules: [],
                      dlqRetentionDays: 14,
                      publisherBrands: [...lambdaApiBrands, ...webappS3Brands],
                      eventHandlerBrands:
                        eventHandlerBrands.length > 0 ? eventHandlerBrands : undefined,
                    },
                    env: envEnv,
                  },
                );

                // EventBridge stack imports Lambda functions from SSM (not construct refs)
                // so we only need a deploy-time dependency to ensure SSM params exist first
                if (eventHandlerStack) {
                  eventBridgeStack.addDependency(eventHandlerStack);
                }
              } catch (error) {
                throw new OrchestrationError(
                  `Failed to create EventBridge stack for environment ${envName}`,
                  'saasWorkload',
                  error instanceof Error ? error : new Error(String(error)),
                );
              }

              // 7e. Scheduled Job Lambda Stack (for background jobs)
              if (scheduledJobBrands.length > 0 && dynamodbStack && ecrStack) {
                const eventBridgeBusNameForJobs = lambdaDefaults?.eventBridgeBusName
                  ? (lambdaDefaults.eventBridgeBusName as string).replace('{env}', envName)
                  : undefined;

                const coreTable = dynamodbStack.tables.get('core');

                for (const brand of scheduledJobBrands) {
                  try {
                    const brandConfig = saasWorkload.find((app: any) => app.name === brand);
                    const jobConfigs = brandConfig?.scheduledJobs || [];

                    if (jobConfigs.length === 0) continue;

                    const brandTable = dynamodbStack.tables.get(brand);
                    if (!brandTable) {
                      throw new Error(`DynamoDB table for brand '${brand}' not found`);
                    }

                    const scheduledJobStack = new ScheduledJobLambdaStack(
                      app,
                      envNaming.stackName(
                        `ScheduledJobs-${brand.charAt(0).toUpperCase() + brand.slice(1)}`,
                      ),
                      {
                        stackConfig,
                        brand,
                        jobs: jobConfigs.map((job: any) => ({
                          name: job.name,
                          description: job.description,
                          schedule: job.schedule,
                          memorySize: job.memorySize ?? lambdaDefaults?.memorySize ?? 1024,
                          timeout: job.timeout ?? 300,
                          enabled: job.enabled !== false,
                        })),
                        dynamodbTable: brandTable,
                        coreTable,
                        eventBridgeBusName: eventBridgeBusNameForJobs,
                        env: envEnv,
                      },
                    );

                    scheduledJobStack.addDependency(dynamodbStack);
                    scheduledJobStack.addDependency(ecrStack);
                  } catch (error) {
                    throw new OrchestrationError(
                      `Failed to create Scheduled Job Lambda stack for brand ${brand} in environment ${envName}`,
                      'saasWorkload',
                      error instanceof Error ? error : new Error(String(error)),
                    );
                  }
                }
              }
            } catch (error) {
              throw new OrchestrationError(
                `Failed to create API Gateway stack for environment ${envName}`,
                'saasWorkload',
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create Lambda stack for environment ${envName}`,
              'saasWorkload',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // 8. Static Hosting Stack (S3 buckets for webapp and marketing sites)
        if (webappS3Brands.length > 0 || marketingS3Brands.length > 0) {
          try {
            const brandBuckets: Array<{ brand: string; type: 'webapp' | 'marketing' }> = [
              ...webappS3Brands.map((brand) => ({ brand, type: 'webapp' as const })),
              ...marketingS3Brands.map((brand) => ({ brand, type: 'marketing' as const })),
            ];

            const mgmtEnv = environments['mgmt'];
            const managementAccountId = mgmtEnv?.accountId;

            new StaticWebAppStack(app, envNaming.stackName('StaticHosting'), {
              stackConfig,
              siteConfig: {
                brandBuckets,
                managementAccountId,
                enableVersioning: true,
              },
              env: envEnv,
            });
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create Static Hosting stack for environment ${envName}`,
              'saasWorkload',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // Skip explicit component processing for this environment
        // since we've derived everything from saasEdge/saasWorkload
        continue;
      }
    }
  }
}
