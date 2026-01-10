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
 * - infrastructure → workload accounts (VPC, ALB, VpcOrigin per environment)
 * - saasWorkload → workload accounts (ECS, Aurora, Secrets, S3 per environment)
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
  InfraVpcStack,
  InfraAlbStack,
  SubdomainZoneStack,
  AlbDnsRecordStack,
  WorkloadParamsStack,
} from '../../stacks/customization';
import {
  VpcStack,
  EcsClusterStack,
  EcsFargateServiceStack,
  SaasSecretsStack,
  AuroraServerlessStack,
  EcrRepositoryStack,
  type BrandServiceConfig,
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
 * @example
 * toComponentName('frontend') // 'Frontend'
 * toComponentName('admin-portal') // 'AdminPortal'
 */
function toComponentName(serviceName: string): string {
  return serviceName
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join('');
}

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
    // Creates VPC, ALB, Origin Domain, and WorkloadParams stacks for workload accounts
    // ========================================================================
    const infrastructureConfig = (config as any).infrastructure;
    const targetEnvNames = infrastructureConfig?.targetEnvironments || [];
    if (infrastructureConfig && targetEnvNames.length > 0) {
      const vpcConfig = infrastructureConfig.vpc || {};
      const albConfig = infrastructureConfig.alb || {};
      const commonParamsConfig = infrastructureConfig.commonParams || {};

      // Get management account ID for VPC Origin sharing and common params
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
          // 1. Create VPC Stack
          const infraVpcStack = new InfraVpcStack(app, envNaming.stackName('Vpc'), {
            stackConfig,
            vpcConfig: {
              cidr: vpcConfig.cidr,
              maxAzs: vpcConfig.maxAzs,
              natGateways: vpcConfig.natGateways,
              enableFlowLogs: vpcConfig.enableFlowLogs,
              flowLogsRetentionDays: vpcConfig.flowLogsRetentionDays,
            },
            env: envEnv,
          });

          // 2. Create Subdomain Zone Stack (Cross-account subdomain delegation)
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

          // 3. Create ALB Stack with certificates and HTTPS listener
          // Creates ALB, ACM certificates (validated in subdomain zones), and HTTPS listener
          // Pattern: alb.nprd.savvue.com → ALB (for nprd), alb.prod.savvue.com → ALB (for prod)
          const infraAlbStack = new InfraAlbStack(app, envNaming.stackName('Alb'), {
            stackConfig,
            vpc: infraVpcStack.vpc,
            albSecurityGroup: infraVpcStack.albSecurityGroup,
            albConfig: {
              internal: albConfig.internal ?? true,
            },
            brandDomains: subdomainZoneStack.brandDomains,
            subdomainZones: subdomainZoneStack.subdomainZones,
            env: envEnv,
          });
          infraAlbStack.addDependency(infraVpcStack);
          infraAlbStack.addDependency(subdomainZoneStack);

          // 4. Create ALB DNS Record Stack
          // Creates A records pointing alb.{env}.{domain} to ALB
          const albDnsRecordStack = new AlbDnsRecordStack(
            app,
            envNaming.stackName('AlbDnsRecord'),
            {
              stackConfig,
              alb: infraAlbStack.alb,
              subdomainZones: subdomainZoneStack.subdomainZones,
              brandDomains: subdomainZoneStack.brandDomains,
              env: envEnv,
            },
          );
          albDnsRecordStack.addDependency(infraAlbStack);
          albDnsRecordStack.addDependency(subdomainZoneStack);

          // 4. Create Workload Params Stack (if commonParams.accountIds is true)
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
          // Brands with any services (not marketing-only)
          const nonMarketingBrands = saasWorkload
            .filter((app: any) => app.services && app.services.length > 0)
            .map((app: any) => app.name);

          // Brands with API service
          const brandSpecificApis = saasWorkload
            .filter((app: any) => app.services?.some((s: any) => s.type === 'api'))
            .map((app: any) => app.name);

          // Brands with webapp service
          const webappBrands = saasWorkload
            .filter((app: any) => app.services?.some((s: any) => s.type === 'webapp'))
            .map((app: any) => app.name);

          // API brands: always include 'core' + brands with API services
          // Core API handles shared routes (auth, billing, etc.)
          // Brand APIs handle brand-specific routes (/{brand}/*)
          const apiBrands = nonMarketingBrands.length > 0 ? ['core', ...brandSpecificApis] : [];

          // Get defaults
          const ecsDefaults = defaults?.ecs;
          const auroraDefaults = defaults?.aurora;

          // VPC is always imported from customization-aws via SSM parameters
          // customization-aws must be deployed first to create:
          // - /codeiqlabs/saas/{env}/vpc/id
          // - /codeiqlabs/saas/{env}/vpc/private-subnet-ids
          // - /codeiqlabs/saas/{env}/alb/arn
          // - /codeiqlabs/saas/{env}/alb/listener-arn

          // Track stacks for dependencies
          let ecsClusterStack: EcsClusterStack | undefined;
          let auroraStack: AuroraServerlessStack | undefined;
          let secretsStack: SaasSecretsStack | undefined;
          const ecsServiceStacks: Map<string, EcsFargateServiceStack> = new Map();

          // 1. Secrets Stack (for database URLs and other secrets)
          if (nonMarketingBrands.length > 0) {
            try {
              // Build secret items for database URLs
              const secretItems = [
                { key: 'database-url-core', description: 'Core database connection URL' },
                ...nonMarketingBrands.map((brand) => ({
                  key: `database-url-${brand}`,
                  description: `${brand} database connection URL`,
                })),
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

              secretsStack = new SaasSecretsStack(app, envNaming.stackName('Secrets'), {
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

          // 2. ECS Cluster Stack
          // VPC is imported from SSM within the stack
          if (webappBrands.length > 0 || apiBrands.length > 0) {
            try {
              ecsClusterStack = new EcsClusterStack(app, envNaming.stackName('ECSCluster'), {
                stackConfig,
                vpc: undefined, // Import from SSM
                clusterConfig: {
                  enableContainerInsights: true,
                },
                env: envEnv,
              });
            } catch (error) {
              throw new OrchestrationError(
                `Failed to create ECS Cluster stack for environment ${envName}`,
                'saasWorkload',
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          }

          // 3. Aurora Stack (for non-marketing brands)
          // VPC and security groups are imported from SSM within the stack
          if (nonMarketingBrands.length > 0) {
            try {
              const databases = ['core', ...nonMarketingBrands];
              auroraStack = new AuroraServerlessStack(app, envNaming.stackName('Aurora'), {
                stackConfig,
                config: {
                  enabled: true,
                  engine: 'aurora-postgresql',
                  engineVersion: auroraDefaults?.engineVersion ?? '16.4',
                  minCapacity: auroraDefaults?.minCapacity ?? 0.5,
                  maxCapacity: auroraDefaults?.maxCapacity ?? 2,
                  databases,
                  backupRetentionDays: 7,
                  deletionProtection: true,
                  performanceInsights: true,
                  performanceInsightsRetention: 7,
                },
                vpc: undefined, // Import from SSM
                ecsSecurityGroup: undefined, // Import from SSM
                env: envEnv,
              });
            } catch (error) {
              throw new OrchestrationError(
                `Failed to create Aurora stack for environment ${envName}`,
                'saasWorkload',
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          }

          // 4.5. ECR Repository Stack (separate from ECS services for persistence)
          let ecrStack: EcrRepositoryStack | undefined; // TODO: Pass to ECS services
          if (webappBrands.length > 0 || apiBrands.length > 0) {
            try {
              ecrStack = new EcrRepositoryStack(app, envNaming.stackName('ECR'), {
                stackConfig,
                repositoryConfig: {
                  webappBrands,
                  apiBrands,
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

          // 5. Webapp ECS Service (shared service for all webapp brands)
          // When importVpcFromSsm is true, VPC/ALB are imported from SSM within the stack
          if (ecsClusterStack && webappBrands.length > 0) {
            try {
              const webappDefaults = ecsDefaults?.webapp;
              const databaseUrlSecretArns = secretsStack
                ? (() => {
                    const map: Record<string, string> = {};
                    for (const [key, secret] of secretsStack.secrets.entries()) {
                      if (!key.startsWith('database-url')) continue;
                      const suffix = key.replace(/^database-url-?/, '');
                      const normalizedKey = suffix || '';
                      map[normalizedKey] = secret.secretArn;
                    }
                    return Object.keys(map).length > 0 ? map : undefined;
                  })()
                : undefined;

              // Build brand-specific Stripe secret ARN maps for webapp
              const stripeSecretKeySecretArns = secretsStack
                ? (() => {
                    const map: Record<string, string> = {};
                    for (const [key, secret] of secretsStack.secrets.entries()) {
                      if (!key.startsWith('stripe-secret-key-')) continue;
                      const brand = key.replace('stripe-secret-key-', '');
                      map[brand] = secret.secretArn;
                    }
                    return Object.keys(map).length > 0 ? map : undefined;
                  })()
                : undefined;

              const stripeWebhookSecretArns = secretsStack
                ? (() => {
                    const map: Record<string, string> = {};
                    for (const [key, secret] of secretsStack.secrets.entries()) {
                      if (!key.startsWith('stripe-webhook-secret-')) continue;
                      const brand = key.replace('stripe-webhook-secret-', '');
                      map[brand] = secret.secretArn;
                    }
                    return Object.keys(map).length > 0 ? map : undefined;
                  })()
                : undefined;

              const stripePublishableKeySecretArns = secretsStack
                ? (() => {
                    const map: Record<string, string> = {};
                    for (const [key, secret] of secretsStack.secrets.entries()) {
                      if (!key.startsWith('stripe-publishable-key-')) continue;
                      const brand = key.replace('stripe-publishable-key-', '');
                      map[brand] = secret.secretArn;
                    }
                    return Object.keys(map).length > 0 ? map : undefined;
                  })()
                : undefined;

              const serviceStack = new EcsFargateServiceStack(app, envNaming.stackName('Webapp'), {
                componentName: 'Webapp',
                stackConfig,
                vpc: undefined, // Import from SSM
                cluster: ecsClusterStack.cluster,
                albSecurityGroup: undefined, // Import from SSM
                ecsSecurityGroup: undefined, // Import from SSM
                ecrRepositories: ecrStack?.webappRepositories,
                serviceConfig: {
                  appKind: 'webapp',
                  serviceName: 'webapp',
                  serviceType: 'webapp',
                  brands: webappBrands,
                  certificateArn: '',
                  defaultContainerPort: 3000,
                  defaultHealthCheckPath: '/api/health',
                  defaultDesiredCount: webappDefaults?.desiredCount ?? 1,
                  defaultCpu: webappDefaults?.cpu ?? 256,
                  defaultMemoryMiB: webappDefaults?.memoryMiB ?? 512,
                  secrets: secretsStack
                    ? {
                        databaseUrlSecretArn:
                          secretsStack.getSecret('database-url-core')?.secretArn,
                        databaseUrlSecretArns,
                        authSecretArn: secretsStack.getSecret('auth-secret')?.secretArn,
                        // Brand-specific Stripe secrets
                        stripeSecretKeySecretArns,
                        stripeWebhookSecretArns,
                        stripePublishableKeySecretArns,
                      }
                    : undefined,
                },
                env: envEnv,
              });
              serviceStack.addDependency(ecsClusterStack);
              if (ecrStack) {
                serviceStack.addDependency(ecrStack);
              }
              ecsServiceStacks.set('webapp', serviceStack);
            } catch (error) {
              throw new OrchestrationError(
                `Failed to create Webapp ECS stack for environment ${envName}`,
                'saasWorkload',
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          }

          // 6. API ECS Service (single stack with all API brands: core + brand-specific)
          // VPC/ALB are imported from SSM within the stack
          // Creates separate ECS services for each brand with path-based routing
          if (ecsClusterStack && apiBrands.length > 0) {
            try {
              const apiDefaults = ecsDefaults?.api;

              // Build database URL secret ARNs for all API services
              const databaseUrlSecretArns = secretsStack
                ? (() => {
                    const map: Record<string, string> = {};
                    for (const [key, secret] of secretsStack.secrets.entries()) {
                      if (!key.startsWith('database-url')) continue;
                      const suffix = key.replace(/^database-url-?/, '');
                      const normalizedKey = suffix || 'core';
                      map[normalizedKey] = secret.secretArn;
                    }
                    return Object.keys(map).length > 0 ? map : undefined;
                  })()
                : undefined;

              // Build brand-specific Stripe secret ARN maps for API
              const stripeSecretKeySecretArns = secretsStack
                ? (() => {
                    const map: Record<string, string> = {};
                    for (const [key, secret] of secretsStack.secrets.entries()) {
                      if (!key.startsWith('stripe-secret-key-')) continue;
                      const brand = key.replace('stripe-secret-key-', '');
                      map[brand] = secret.secretArn;
                    }
                    return Object.keys(map).length > 0 ? map : undefined;
                  })()
                : undefined;

              const stripeWebhookSecretArns = secretsStack
                ? (() => {
                    const map: Record<string, string> = {};
                    for (const [key, secret] of secretsStack.secrets.entries()) {
                      if (!key.startsWith('stripe-webhook-secret-')) continue;
                      const brand = key.replace('stripe-webhook-secret-', '');
                      map[brand] = secret.secretArn;
                    }
                    return Object.keys(map).length > 0 ? map : undefined;
                  })()
                : undefined;

              const stripePublishableKeySecretArns = secretsStack
                ? (() => {
                    const map: Record<string, string> = {};
                    for (const [key, secret] of secretsStack.secrets.entries()) {
                      if (!key.startsWith('stripe-publishable-key-')) continue;
                      const brand = key.replace('stripe-publishable-key-', '');
                      map[brand] = secret.secretArn;
                    }
                    return Object.keys(map).length > 0 ? map : undefined;
                  })()
                : undefined;

              // Build brandConfigs for API services
              // Core API uses port 3000, brand-specific APIs use port 3003
              const apiBrandConfigs: Record<string, Partial<BrandServiceConfig>> = {};
              for (const brand of apiBrands) {
                if (brand === 'core') {
                  // Core API uses default port 3000
                  apiBrandConfigs[brand] = {
                    containerPort: 3000,
                  };
                } else {
                  // Brand-specific APIs use port 3003
                  apiBrandConfigs[brand] = {
                    containerPort: 3003,
                  };
                }
              }

              const apiStack = new EcsFargateServiceStack(app, envNaming.stackName('Api'), {
                componentName: 'Api',
                stackConfig,
                vpc: undefined, // Import from SSM
                cluster: ecsClusterStack.cluster,
                albSecurityGroup: undefined, // Import from SSM
                ecsSecurityGroup: undefined, // Import from SSM
                ecrRepositories: ecrStack?.apiRepositories,
                serviceConfig: {
                  appKind: 'api',
                  serviceName: 'api',
                  serviceType: 'api',
                  brands: apiBrands, // ['core', 'savvue', 'equitrio']
                  certificateArn: '',
                  defaultContainerPort: 3000, // Default for core API
                  defaultHealthCheckPath: '/health',
                  defaultDesiredCount: apiDefaults?.desiredCount ?? 1,
                  defaultCpu: apiDefaults?.cpu ?? 512,
                  defaultMemoryMiB: apiDefaults?.memoryMiB ?? 1024,
                  brandConfigs: apiBrandConfigs, // Per-brand port overrides
                  secrets: secretsStack
                    ? (() => {
                        // Build Google OAuth secret ARNs from perBrandSecrets
                        const googleOAuthSecretArns: Record<string, string> = {};
                        const googleOAuthSecrets = secretsStack.perBrandSecrets.get('google-oauth');
                        if (googleOAuthSecrets) {
                          for (const [brand, secret] of googleOAuthSecrets.entries()) {
                            googleOAuthSecretArns[brand] = secret.secretArn;
                          }
                        }
                        return {
                          databaseUrlSecretArns,
                          authSecretArn: secretsStack.getSecret('auth-secret')?.secretArn,
                          // Brand-specific Stripe secrets
                          stripeSecretKeySecretArns,
                          stripeWebhookSecretArns,
                          stripePublishableKeySecretArns,
                          // Brand-specific Google OAuth secrets
                          googleOAuthSecretArns:
                            Object.keys(googleOAuthSecretArns).length > 0
                              ? googleOAuthSecretArns
                              : undefined,
                        };
                      })()
                    : undefined,
                  // Stripe price IDs from manifest (non-secret, environment-specific)
                  stripePrices: this.buildStripePricesConfig(saasWorkload, envName),
                },
                env: envEnv,
              });
              apiStack.addDependency(ecsClusterStack);
              if (ecrStack) {
                apiStack.addDependency(ecrStack);
              }
              if (auroraStack) {
                apiStack.addDependency(auroraStack);
              }
              ecsServiceStacks.set('api', apiStack);
            } catch (error) {
              throw new OrchestrationError(
                `Failed to create API ECS stack for environment ${envName}`,
                'saasWorkload',
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          }

          // 7. Static Hosting Stack (S3 buckets)
          // NOTE: For saasWorkload, S3 buckets are created in customization-aws (management account)
          // by CloudFrontVpcOriginStack for marketing distributions.
          // No S3 buckets are created in workload accounts for saasWorkload.

          // 8. Origin Zones Stack - DEPRECATED
          // The origin-{env}.{brand}.com pattern has been replaced by alb.{env}.{brand}.com
          // DNS records are now created by SubdomainZoneStack in customization-aws
          // This section is intentionally removed to clean up deprecated infrastructure

          // Skip explicit component processing for this environment
          // since we've derived everything from saasEdge/saasWorkload
          continue;
        }

        // ======================================================================
        // EXPLICIT COMPONENT CONFIGURATION
        // Used when saasEdge/saasWorkload is not present or for management environment
        // ======================================================================
        const computeConfig = (config as any).compute;
        const secretsConfig = (config as any).secrets;
        const auroraConfig = (config as any).aurora;

        // Track VPC stack for dependent stacks
        let vpcStack: VpcStack | undefined;

        // Track ECS service stacks for origin zone creation
        const ecsServiceStacks: Map<string, EcsFargateServiceStack> = new Map();

        // Networking/VPC stack (if present)
        if (config.networking?.vpc) {
          try {
            vpcStack = new VpcStack(app, envNaming.stackName('VPC'), {
              stackConfig,
              vpcConfig: {
                cidr: config.networking.vpc.cidr,
                maxAzs: config.networking.vpc.maxAzs,
                natGateways: config.networking.vpc.natGateways,
                enableFlowLogs: config.networking.vpc.enableFlowLogs,
                flowLogsRetentionDays: config.networking.vpc.flowLogsRetentionDays,
              },
              env: envEnv,
            });
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create VPC stack for environment ${envName}`,
              'networking',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // Secrets stack (if present)
        let secretsStack: SaasSecretsStack | undefined;
        if (secretsConfig) {
          try {
            secretsStack = new SaasSecretsStack(app, envNaming.stackName('Secrets'), {
              stackConfig,
              secretsConfig: {
                recoveryWindowInDays: secretsConfig.recoveryWindowInDays ?? 7,
                brands: secretsConfig.brands,
                items: secretsConfig.items,
              },
              env: envEnv,
            });
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create Secrets stack for environment ${envName}`,
              'secrets',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // ECS Cluster stack (if compute.ecs is present and VPC exists)
        let ecsClusterStack: EcsClusterStack | undefined;
        if (computeConfig?.ecs && vpcStack) {
          try {
            ecsClusterStack = new EcsClusterStack(app, envNaming.stackName('ECSCluster'), {
              stackConfig,
              vpc: vpcStack.vpc,
              clusterConfig: {
                enableContainerInsights: true,
              },
              env: envEnv,
            });
            ecsClusterStack.addDependency(vpcStack);
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create ECS Cluster stack for environment ${envName}`,
              'compute',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // Aurora stack (if enabled and VPC exists)
        let auroraStack: AuroraServerlessStack | undefined;
        const envAuroraOverrides = (envConfig.config as any)?.aurora;
        const resolvedAuroraConfig = auroraConfig
          ? { ...auroraConfig, ...(envAuroraOverrides || {}) }
          : undefined;

        if (resolvedAuroraConfig && !vpcStack) {
          throw new OrchestrationError(
            `Aurora stack for environment ${envName} requires networking.vpc to be present`,
            'aurora',
            new Error('VPC stack not available for Aurora configuration'),
          );
        }

        if (resolvedAuroraConfig && vpcStack) {
          try {
            auroraStack = new AuroraServerlessStack(app, envNaming.stackName('Aurora'), {
              stackConfig,
              config: resolvedAuroraConfig,
              vpc: vpcStack.vpc,
              ecsSecurityGroup: vpcStack.ecsSecurityGroup,
              env: envEnv,
            });
            auroraStack.addDependency(vpcStack);
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create Aurora stack for environment ${envName}`,
              'aurora',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // ECS Fargate Service stacks for each service in the services array
        const ecsConfig = computeConfig?.ecs;
        if (ecsConfig?.services && vpcStack && ecsClusterStack) {
          for (const service of ecsConfig.services) {
            // Skip worker services (no ALB needed - they run as background tasks)
            if (service.type === 'worker') continue;

            // Skip worker services (no ALB needed - they run as background tasks)
            if (service.type === 'worker') continue;

            try {
              const serviceName = service.name || service.type;
              const appKind = service.type;
              const componentName = toComponentName(serviceName);

              // Determine brands based on service type:
              // - 'webapp' services: use explicit brands array (schema-validated to be non-empty)
              // - 'api' services: single identifier derived from name/type
              const serviceBrands = service.type === 'webapp' ? service.brands! : [serviceName];

              const googleOAuthSecretArns =
                secretsStack && secretsConfig?.brands
                  ? secretsConfig.brands.reduce(
                      (acc: Record<string, string>, brandName: string) => {
                        const secret = secretsStack?.getPerBrandSecret('google-oauth', brandName);
                        if (secret) {
                          acc[brandName] = secret.secretArn;
                        }
                        return acc;
                      },
                      {},
                    )
                  : undefined;

              const databaseUrlSecretArns =
                secretsStack && secretsConfig
                  ? (() => {
                      const map: Record<string, string> = {};
                      for (const [key, secret] of secretsStack.secrets.entries()) {
                        if (!key.startsWith('database-url')) continue;
                        const suffix = key.replace(/^database-url-?/, '');
                        const normalizedKey = suffix || '';
                        map[normalizedKey] = secret.secretArn;
                      }
                      return Object.keys(map).length > 0 ? map : undefined;
                    })()
                  : undefined;

              // Build brand-specific Stripe secret ARN maps
              const stripeSecretKeySecretArns =
                secretsStack && secretsConfig
                  ? (() => {
                      const map: Record<string, string> = {};
                      for (const [key, secret] of secretsStack.secrets.entries()) {
                        if (!key.startsWith('stripe-secret-key-')) continue;
                        const brand = key.replace('stripe-secret-key-', '');
                        map[brand] = secret.secretArn;
                      }
                      return Object.keys(map).length > 0 ? map : undefined;
                    })()
                  : undefined;

              const stripeWebhookSecretArns =
                secretsStack && secretsConfig
                  ? (() => {
                      const map: Record<string, string> = {};
                      for (const [key, secret] of secretsStack.secrets.entries()) {
                        if (!key.startsWith('stripe-webhook-secret-')) continue;
                        const brand = key.replace('stripe-webhook-secret-', '');
                        map[brand] = secret.secretArn;
                      }
                      return Object.keys(map).length > 0 ? map : undefined;
                    })()
                  : undefined;

              const stripePublishableKeySecretArns =
                secretsStack && secretsConfig
                  ? (() => {
                      const map: Record<string, string> = {};
                      for (const [key, secret] of secretsStack.secrets.entries()) {
                        if (!key.startsWith('stripe-publishable-key-')) continue;
                        const brand = key.replace('stripe-publishable-key-', '');
                        map[brand] = secret.secretArn;
                      }
                      return Object.keys(map).length > 0 ? map : undefined;
                    })()
                  : undefined;

              const serviceSecrets =
                secretsStack && secretsConfig
                  ? {
                      databaseUrlSecretArn: secretsStack.getSecret('database-url')?.secretArn,
                      databaseUrlSecretArns,
                      authSecretArn: secretsStack.getSecret('auth-secret')?.secretArn,
                      googleOAuthSecretArns,
                      // Brand-specific Stripe secrets
                      stripeSecretKeySecretArns,
                      stripeWebhookSecretArns,
                      stripePublishableKeySecretArns,
                    }
                  : undefined;

              const serviceStack = new EcsFargateServiceStack(
                app,
                envNaming.stackName(componentName),
                {
                  componentName,
                  stackConfig,
                  vpc: vpcStack.vpc,
                  cluster: ecsClusterStack.cluster,
                  albSecurityGroup: vpcStack.albSecurityGroup,
                  ecsSecurityGroup: vpcStack.ecsSecurityGroup,
                  serviceConfig: {
                    appKind,
                    serviceName,
                    serviceType: service.type,
                    brands: serviceBrands,
                    certificateArn: ecsConfig.certificateArn || '',
                    // defaultBrand is derived from brands[0] in the stack
                    defaultContainerPort: service.containerPort,
                    defaultHealthCheckPath: service.healthCheckPath,
                    defaultDesiredCount: service.desiredCount,
                    defaultCpu: service.cpu,
                    defaultMemoryMiB: service.memoryMiB,
                    secrets: serviceSecrets,
                  },
                  env: envEnv,
                },
              );
              serviceStack.addDependency(ecsClusterStack);
              if (auroraStack && appKind === 'api') {
                serviceStack.addDependency(auroraStack);
              }

              // Track service stack for origin zone creation
              // Key is the service type (webapp, api) which maps to origin record names
              ecsServiceStacks.set(service.type, serviceStack);
            } catch (error) {
              throw new OrchestrationError(
                `Failed to create ${service.type} ECS stack for environment ${envName}`,
                'compute',
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          }
        }

        // Origin Hosted Zone stack - DEPRECATED
        // The origin-{env}.{brand}.com pattern has been replaced by alb.{env}.{brand}.com
        // DNS records are now created by SubdomainZoneStack in customization-aws
        // This section is intentionally removed to clean up deprecated infrastructure

        // Static Web App stack (if present)
        // Brands are derived from saasEdge or saasWorkload if available
        const staticHostingConfig = (config as any).staticHosting;
        if (staticHostingConfig) {
          try {
            // Derive brands from saasEdge or saasWorkload
            const saasEdgeLocal = (config as any).saasEdge as any[] | undefined;
            const saasWorkloadLocal = (config as any).saasWorkload as any[] | undefined;
            const brands = saasEdgeLocal
              ? saasEdgeLocal.map((app: any) => app.name)
              : saasWorkloadLocal
                ? saasWorkloadLocal.map((app: any) => app.name)
                : [];

            if (brands.length > 0) {
              // Use a stack name that matches the static hosting component to avoid
              // confusion with the ECS Webapp stack
              new StaticWebAppStack(app, envNaming.stackName('StaticHosting'), {
                stackConfig,
                siteConfig: {
                  brands,
                  managementAccountId:
                    staticHostingConfig.managementAccountId || deploymentAccountId,
                  enableVersioning: true,
                },
                env: envEnv,
              });
            }
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create Static Web App stack for environment ${envName}`,
              'staticHosting',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
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

  /**
   * Build Stripe price IDs configuration from manifest
   *
   * Extracts environment-specific price IDs from the saasWorkload configuration.
   * Price IDs are non-secret public identifiers that vary by environment.
   *
   * @param saasWorkload - The saasWorkload configuration from manifest
   * @param envName - The environment name (e.g., 'nprd', 'prod')
   * @returns EcsStripePriceConfig or undefined if no price IDs are configured
   */
  private buildStripePricesConfig(
    saasWorkload: any[] | undefined,
    envName: string,
  ):
    | { monthlyPriceIds?: Record<string, string>; annualPriceIds?: Record<string, string> }
    | undefined {
    if (!saasWorkload) return undefined;

    const monthlyPriceIds: Record<string, string> = {};
    const annualPriceIds: Record<string, string> = {};

    for (const app of saasWorkload) {
      // Check for environment-specific stripe config
      const stripeConfig = app.stripe?.[envName] ?? app.stripe;
      if (!stripeConfig) continue;

      const brand = app.name;
      if (stripeConfig.priceIdMonthly) {
        monthlyPriceIds[brand] = stripeConfig.priceIdMonthly;
      }
      if (stripeConfig.priceIdAnnual) {
        annualPriceIds[brand] = stripeConfig.priceIdAnnual;
      }
    }

    // Return undefined if no price IDs were found
    if (Object.keys(monthlyPriceIds).length === 0 && Object.keys(annualPriceIds).length === 0) {
      return undefined;
    }

    return {
      monthlyPriceIds: Object.keys(monthlyPriceIds).length > 0 ? monthlyPriceIds : undefined,
      annualPriceIds: Object.keys(annualPriceIds).length > 0 ? annualPriceIds : undefined,
    };
  }
}
