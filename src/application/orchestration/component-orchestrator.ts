/**
 * Component-Based Orchestrator
 *
 * Unified orchestrator using convention-over-configuration.
 * Presence of a section implies it is enabled - no 'enabled: true' flags needed.
 *
 * **Key Principles:**
 * - Presence implies enabled - if a section exists, it's deployed
 * - Subdomains derived from saasEdge/saasWorkload - no enumeration needed
 * - Any component can be deployed to any account
 * - Maximum flexibility - no artificial constraints
 *
 * **Architecture:**
 * - Creates stacks directly in the App (no CDK stages)
 * - Each component gets its own CloudFormation stack
 * - Deploy with `cdk deploy <StackName ...>`; discover via `cdk list`
 *
 * **What Gets Deployed Where:**
 * - organization → mgmt account (single stack)
 * - identityCenter → mgmt account (single stack)
 * - domains/saasEdge → mgmt account (RootDomain, AcmAndWaf, CloudFront, DnsRecords)
 * - infrastructure → workload accounts (VPC, SubdomainZone, ApiGatewayDomain per environment)
 * - saasWorkload → workload accounts (ECS, DynamoDB, Secrets, S3 per environment)
 *
 * @example Management account deployment
 * ```yaml
 * environments:
 *   mgmt:
 *     accountId: "682475224767"
 *     region: us-east-1
 * organization:
 *   rootId: "r-xxxx"
 * identityCenter:
 *   instanceArn: "arn:aws:sso:::instance/ssoins-xxx"
 * saasEdge:
 *   - domain: savvue.com
 *     distributions:
 *       - type: marketing
 * ```
 *
 * @example Customization deployment (infrastructure + CDN)
 * ```yaml
 * environments:
 *   mgmt:
 *     accountId: "682475224767"
 *   nprd:
 *     accountId: "466279485605"
 *   prod:
 *     accountId: "719640820326"
 * saasEdge:
 *   - domain: savvue.com
 *     distributions:
 *       - type: webapp
 *       - type: api
 * infrastructure:
 *   targetEnvironments: [nprd, prod]
 * ```
 */

import type { CdkApplication } from '../cdk-application';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';
import { BaseOrchestrator, OrchestrationError } from './base-orchestrator';
import { ManagementOrganizationsStack } from '../../stacks/organizations/organizations-stack';
import { ManagementIdentityCenterStack } from '../../stacks/identity-center/identity-center-stack';
import {
  GitHubOidcStack,
  SubdomainZoneStack,
  ApiGatewayDomainStack,
  WorkloadParamsStack,
} from '../../stacks/customization';
import {
  SaasSecretsStack,
  DynamoDBStack,
  EcrRepositoryStack,
  LambdaFunctionStack,
  ApiGatewayStack,
  EventBridgeStack,
} from '../../stacks/workload';
import {
  RootDomainStack,
  AcmAndWafStack,
  CloudFrontVpcOriginStack,
  DnsRecordsStack,
  StaticWebAppStack,
} from '../../stacks/domains';
import { ResourceNaming } from '@codeiqlabs/aws-utils';

/**
 * Convert service name to PascalCase component name
 *


/**
 * Unified component-based orchestrator
 *
 * This class detects enabled components in the manifest and creates the appropriate
 * stacks in the correct accounts. It replaces the previous manifestType-based
 * orchestrators with a simpler, more flexible approach.
 *
 * @example
 * ```typescript
 * // Client code (bin/app.ts)
 * import { createApp } from '@codeiqlabs/aws-cdk';
 *
 * createApp().then(app => app.synth());
 *
 * // Library automatically creates stacks for enabled components
 * ```
 */
export class ComponentOrchestrator implements BaseOrchestrator {
  /**
   * Create infrastructure stacks based on enabled components
   *
   * Detects which components are enabled in the manifest and creates the
   * appropriate CloudFormation stacks in the correct accounts.
   *
   * @param app - CDK application instance
   * @throws OrchestrationError if stack creation fails
   */
  createStages(app: CdkApplication): void {
    const config = app.config as unknown as UnifiedAppConfig;

    // Check for environment filter from CDK context
    // Usage: cdk deploy -c targetEnv=nprd
    const targetEnvFilter = app.node.tryGetContext('targetEnv') as string | undefined;
    if (targetEnvFilter) {
      console.log(`[ComponentOrchestrator] Filtering to environment: ${targetEnvFilter}`);
    }

    // Derive deployment target: use 'mgmt' environment if present, otherwise first environment
    // environments is required in UnifiedAppConfig schema
    const environments = config.environments!;
    const deploymentTarget = environments['mgmt'] ?? Object.values(environments)[0];

    if (!deploymentTarget) {
      throw new OrchestrationError(
        'At least one environment must be defined in manifest',
        'config',
        new Error('No environments found'),
      );
    }

    const deploymentAccountId = deploymentTarget.accountId;
    const deploymentRegion = deploymentTarget.region;

    // Get naming configuration from manifest (required)
    const namingConfig = config.naming;
    const company = namingConfig.company;
    const project = namingConfig.project;
    // Owner defaults to company if not specified in manifest
    const owner = namingConfig.owner || company;
    // Skip environment name in stack names (e.g., management-aws)
    const skipEnvironmentName = (namingConfig as any).skipEnvironmentName === true;

    // Create resource naming utility
    const naming = new ResourceNaming({
      company,
      project,
      environment: 'mgmt', // Management account environment is always 'mgmt'
      region: deploymentRegion,
      accountId: deploymentAccountId,
    });

    // Stack name options - skip environment for repos with skipEnvironmentName=true
    const mgmtStackNameOptions = skipEnvironmentName ? { skipEnvironment: true } : undefined;

    // Primary deployment environment (for single-account components)
    const primaryEnv = {
      account: deploymentAccountId,
      region: deploymentRegion,
    };

    // ========================================================================
    // SINGLE-ACCOUNT COMPONENTS
    // These deploy to the primary deployment target
    // Presence implies enabled - no 'enabled' flag needed
    // ========================================================================

    // Create Organizations stack if present
    let organizationsStack: ManagementOrganizationsStack | undefined;
    if (config.organization) {
      try {
        organizationsStack = new ManagementOrganizationsStack(
          app,
          naming.stackName('Organizations', mgmtStackNameOptions),
          {
            stackConfig: {
              project,
              environment: 'mgmt',
              region: deploymentRegion,
              accountId: deploymentAccountId,
              owner,
              company,
            },
            config: config as any,
            orgRootId: config.organization.rootId,
            env: primaryEnv,
          },
        );
      } catch (error) {
        throw new OrchestrationError(
          'Failed to create Organizations stack',
          'organizations',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    // Build accountIds map for Identity Center assignments
    // This map is used to resolve account keys (e.g., "budgettrack-nprd") to account IDs
    let accountIds: Record<string, string> = {};

    // If Organizations stack exists, get account IDs from it
    if (organizationsStack) {
      accountIds = organizationsStack.accountIds;
    } else if (config.organization?.organizationalUnits) {
      // If no Organizations stack but we have org config, build map from manifest
      // This handles the case where organization is disabled but we still need account mappings
      for (const ou of config.organization.organizationalUnits) {
        if (ou.accounts) {
          for (const account of ou.accounts) {
            if (account.accountId) {
              accountIds[account.key] = account.accountId;
            }
          }
        }
      }
    }

    // Create Identity Center stack if present
    if (config.identityCenter) {
      try {
        new ManagementIdentityCenterStack(
          app,
          naming.stackName('IdentityCenter', mgmtStackNameOptions),
          {
            stackConfig: {
              project,
              environment: 'mgmt',
              region: deploymentRegion,
              accountId: deploymentAccountId,
              owner,
              company,
            },
            config: config as any,
            accountIds, // Pass the account IDs map for assignment resolution
            env: primaryEnv,
          },
        );
      } catch (error) {
        throw new OrchestrationError(
          'Failed to create Identity Center stack',
          'identityCenter',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    // ========================================================================
    // INFRASTRUCTURE COMPONENTS (customization-aws)
    // Creates SubdomainZone, ApiGatewayDomain, and WorkloadParams stacks for workload accounts
    // Serverless architecture: No VPC/ALB needed
    // ========================================================================
    const infrastructureConfig = (config as any).infrastructure;
    const targetEnvNames = infrastructureConfig?.targetEnvironments || [];
    if (infrastructureConfig && targetEnvNames.length > 0) {
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
            `[ComponentOrchestrator] Skipping infrastructure for environment: ${envName}`,
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
            const registeredDomains = (config.domains as any)?.registeredDomains as
              | any[]
              | undefined;
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

    // Create Domain Management stacks if domains or saasEdge is present
    // Domains are derived from saasEdge or domains.registeredDomains (convention-over-configuration)
    const saasEdge = (config as any).saasEdge as any[] | undefined;
    const registeredDomains = (config.domains as any)?.registeredDomains as any[] | undefined;
    const hasDomains =
      (registeredDomains && registeredDomains.length > 0) || (saasEdge && saasEdge.length > 0);

    if (hasDomains) {
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

          // NOTE: Hybrid DNS Delegation Architecture
          // CloudFront origins use delegated subdomain pattern: alb.{env}.{brand}.com
          // DNS resolution flow:
          //   1. CloudFront requests alb.nprd.savvue.com
          //   2. savvue.com zone has NS record: nprd.savvue.com → workload zone NS
          //   3. nprd.savvue.com zone (workload account) has A record: alb → ALB
          // Deployment order:
          //   1. Deploy SubdomainZoneStack in workload accounts (creates delegated zones + NS delegation)
          //   2. Deploy CloudFrontStack in management account (uses delegated origins)
          // No SSM lookups needed - DNS resolution happens at runtime

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

    // ========================================================================
    // MULTI-ENVIRONMENT COMPONENTS
    // These deploy to each environment defined in the environments section
    // ========================================================================

    if (config.environments) {
      for (const [envName, envConfig] of Object.entries(config.environments)) {
        // Skip if environment filter is set and doesn't match
        if (targetEnvFilter && envName !== targetEnvFilter && envName !== 'mgmt') {
          console.log(`[ComponentOrchestrator] Skipping saasWorkload for environment: ${envName}`);
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

          // Brands with any non-marketing services (for DynamoDB/Secrets creation)
          const nonMarketingBrands = saasWorkload
            .filter((app: any) => app.lambdaApi === true)
            .map((app: any) => app.name);

          // Get Lambda defaults from manifest
          const lambdaDefaults = defaults?.lambda;

          // Track stacks for dependencies
          let dynamodbStack: DynamoDBStack | undefined;

          // 1. Secrets Stack (for application secrets - no database URLs needed with DynamoDB)
          if (nonMarketingBrands.length > 0) {
            try {
              // Build secret items for application secrets
              // DynamoDB uses IAM roles for access, no connection strings needed
              const secretItems = [
                { key: 'auth-secret', description: 'Auth.js secret', generated: true },
                // Brand-specific Stripe secrets (one set per brand)
                ...nonMarketingBrands.flatMap((brand) => [
                  {
                    key: `stripe-secret-key-${brand}`,
                    description: `Stripe secret key for ${brand}`,
                  },
                  {
                    key: `stripe-webhook-secret-${brand}`,
                    description: `Stripe webhook secret for ${brand}`,
                  },
                  {
                    key: `stripe-publishable-key-${brand}`,
                    description: `Stripe publishable key for ${brand}`,
                  },
                ]),
                // Brand-specific Google OAuth secrets (for Auth.js)
                {
                  key: 'google-oauth',
                  description: 'Google OAuth client credentials',
                  perBrand: true,
                  jsonFields: ['clientId', 'clientSecret'],
                },
              ];

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
          // Each workload with lambdaApi or webapp gets its own DynamoDB table
          // 'core' is included in nonMarketingBrands when it has lambdaApi: true
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
            } catch (error) {
              throw new OrchestrationError(
                `Failed to create DynamoDB stack for environment ${envName}`,
                'saasWorkload',
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          }

          // 3. ECR Repository Stack (for Lambda container images)
          // Lambda functions use Docker images from ECR
          let ecrStack: EcrRepositoryStack | undefined;
          if (lambdaApiBrands.length > 0) {
            try {
              ecrStack = new EcrRepositoryStack(app, envNaming.stackName('ECR'), {
                stackConfig,
                repositoryConfig: {
                  webappBrands: [], // No ECS webapps
                  apiBrands: lambdaApiBrands,
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
          // Creates Lambda functions from ECR images with DynamoDB access
          // Derived from lambdaApi: true in saasWorkload brands
          if (lambdaApiBrands.length > 0 && dynamodbStack) {
            try {
              // Build Lambda function configs from lambdaApiBrands
              // ECR repos are named {brand}-api (e.g., core-api, savvue-api)
              // Lambda functions are named api-{brand} (e.g., api-core, api-savvue)
              const lambdaFunctions = lambdaApiBrands.map((brand) => ({
                name: `api-${brand}`,
                ecrRepositoryName: `${brand}-api`, // Match ECR naming: {brand}-api
                memorySize: lambdaDefaults?.memorySize ?? 1024,
                timeout: lambdaDefaults?.timeout ?? 30,
              }));

              // Resolve EventBridge bus name with environment placeholder
              const eventBridgeBusName = lambdaDefaults?.eventBridgeBusName
                ? (lambdaDefaults.eventBridgeBusName as string).replace('{env}', envName)
                : undefined;

              const lambdaStack = new LambdaFunctionStack(app, envNaming.stackName('Lambda'), {
                stackConfig,
                config: {
                  functions: lambdaFunctions,
                  // EventBridge bus name from defaults.lambda.eventBridgeBusName
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
              // Creates HTTP API with routes for each Lambda function
              // Pattern: /core/{proxy+} → api-core, /savvue/{proxy+} → api-savvue, etc.
              try {
                // Build API routes from lambdaApiBrands
                const apiRoutes = lambdaApiBrands.map((brand) => ({
                  path: `/${brand}/{proxy+}`,
                  lambdaName: `api-${brand}`,
                }));

                // Derive CORS origins from brands with domains (webapps that call the API)
                // These are served via S3 + CloudFront static hosting
                const corsOrigins = saasWorkload
                  .filter((app: any) => app.domain)
                  .map((app: any) => `https://app.${app.domain}`);

                // Get brand domains that have lambdaApi: true for API mappings
                const apiMappingDomains = saasWorkload
                  .filter((app: any) => app.lambdaApi === true && app.domain)
                  .map((app: any) => app.domain);

                const apiGatewayStack = new ApiGatewayStack(
                  app,
                  envNaming.stackName('ApiGateway'),
                  {
                    stackConfig,
                    config: {
                      routes: apiRoutes,
                      corsOrigins: corsOrigins.length > 0 ? corsOrigins : undefined,
                    },
                    lambdaFunctions: lambdaStack.functions,
                    // Pass domains for API mapping creation
                    // DomainNames are created by customization-aws ApiGatewayDomainStack
                    apiMappingDomains: apiMappingDomains.length > 0 ? apiMappingDomains : undefined,
                    env: envEnv,
                  },
                );
                apiGatewayStack.addDependency(lambdaStack);

                // 7c. EventBridge Stack (event bus for async communication)
                // Create event bus with routing rules for subscription events
                // Note: Lambda functions get EventBridge permissions via environment variables
                // and IAM policies configured in the Lambda stack, not via cross-stack grants
                try {
                  new EventBridgeStack(app, envNaming.stackName('EventBridge'), {
                    stackConfig,
                    config: {
                      // Event rules will be configured when Lambda handlers are ready
                      eventRules: [],
                      dlqRetentionDays: 14,
                      publisherBrands: [...lambdaApiBrands, ...webappS3Brands],
                    },
                    // Don't pass lambdaFunctions to avoid cyclic dependency
                    // Lambda functions will look up EventBridge ARN from SSM
                    env: envEnv,
                  });
                  // Note: No dependency on lambdaStack to avoid cyclic reference
                  // EventBridge stack exports bus ARN to SSM, Lambda functions import it
                } catch (error) {
                  throw new OrchestrationError(
                    `Failed to create EventBridge stack for environment ${envName}`,
                    'saasWorkload',
                    error instanceof Error ? error : new Error(String(error)),
                  );
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
          // Creates S3 buckets in workload accounts based on webappS3/marketingS3 flags
          // CloudFront in management account accesses these via cross-account OAC
          if (webappS3Brands.length > 0 || marketingS3Brands.length > 0) {
            try {
              // Build brandBuckets array from webappS3 and marketingS3 flags
              const brandBuckets: Array<{ brand: string; type: 'webapp' | 'marketing' }> = [
                ...webappS3Brands.map((brand) => ({ brand, type: 'webapp' as const })),
                ...marketingS3Brands.map((brand) => ({ brand, type: 'marketing' as const })),
              ];

              // Get management account ID from environments.mgmt or SSM
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

          // 9. Origin Zones Stack - DEPRECATED
          // The origin-{env}.{brand}.com pattern has been replaced by alb.{env}.{brand}.com
          // DNS records are now created by SubdomainZoneStack in customization-aws
          // This section is intentionally removed to clean up deprecated infrastructure

          // Skip explicit component processing for this environment
          // since we've derived everything from saasEdge/saasWorkload
          continue;
        }
      }
    }

    // ========================================================================
    // GITHUB OIDC COMPONENTS
    // These deploy GitHub Actions OIDC roles to workload accounts for CI/CD
    // ========================================================================

    // Create GitHub OIDC stacks if githubOidc is present
    // These roles allow GitHub Actions to authenticate via OIDC and deploy to AWS
    const githubOidc = (config as any).githubOidc;
    const oidcTargets = githubOidc?.targets;
    if (githubOidc && oidcTargets) {
      for (const target of oidcTargets) {
        const targetProjectName = target.projectName;
        const targetEnvNames = target.targetEnvironments || [];

        for (const envName of targetEnvNames) {
          // Resolve environment from main environments section
          const envConfig = config.environments[envName];
          if (!envConfig) {
            throw new OrchestrationError(
              `Environment '${envName}' referenced in githubOidc.targets[].targetEnvironments not found in environments section`,
              'githubOidc',
              new Error(`Missing environment: ${envName}`),
            );
          }

          try {
            const envNaming = new ResourceNaming({
              company,
              project: targetProjectName,
              environment: envName,
              region: envConfig.region,
              accountId: envConfig.accountId,
            });

            // Build repository configurations
            const repositories = (target.repositories || []).map(
              (repo: {
                owner: string;
                repo: string;
                branch?: string;
                allowTags?: boolean;
                environments?: string[];
              }) => ({
                owner: repo.owner,
                repo: repo.repo,
                branch: repo.branch || 'main',
                allowTags: repo.allowTags !== false,
                environments: repo.environments || [],
              }),
            );

            // Prefixes are optional - GitHubOidcStack derives defaults from stackConfig
            new GitHubOidcStack(app, envNaming.stackName('GitHubOIDC'), {
              stackConfig: {
                project: targetProjectName,
                environment: envName,
                region: envConfig.region,
                accountId: envConfig.accountId,
                owner,
                company,
              },
              repositories,
              ecrRepositoryPrefix: target.ecrRepositoryPrefix,
              s3BucketPrefix: target.s3BucketPrefix,
              ecsClusterPrefix: target.ecsClusterPrefix,
              env: {
                account: envConfig.accountId,
                region: envConfig.region,
              },
            });
          } catch (error) {
            if (error instanceof OrchestrationError) {
              throw error;
            }
            throw new OrchestrationError(
              `Failed to create GitHub OIDC stack for ${targetProjectName}-${envName}`,
              'githubOidc',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
      }
    }
  }
}
