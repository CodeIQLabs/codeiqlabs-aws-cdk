/**
 * Component-Based Orchestrator
 *
 * This unified orchestrator replaces the previous manifestType-based approach
 * (ManagementOrchestrator and WorkloadOrchestrator) with a component-based strategy.
 *
 * **Key Principles:**
 * - No manifestType validation - components define what gets deployed
 * - Any component can be deployed to any account
 * - Single-account components deploy to the primary deployment target
 * - Multi-environment components deploy to each environment
 * - Maximum flexibility - no artificial constraints
 *
 * **Architecture:**
 * - Creates stacks directly in the App (no CDK stages)
 * - Each enabled component gets its own CloudFormation stack
 * - Deploy with `cdk deploy <StackName ...>`; discover via `cdk list`
 * - Clean, discoverable stack names
 *
 * **What Gets Deployed Where:**
 * - organization → deployment.accountId (single stack)
 * - identityCenter → deployment.accountId (single stack)
 * - domains → deployment.accountId (DomainFoundationStage: RootDomain + AcmAndWaf + optional
 *   DomainDelegation; DomainWireupStage: CloudFrontDistribution + DnsRecords)
 * - networking → environments[*].accountId (one stack per environment)
 *
 * @example Single-account deployment
 * ```yaml
 * deployment:
 *   accountId: "682475224767"
 *   region: us-east-1
 * organization:
 *   enabled: true
 * identityCenter:
 *   enabled: true
 * domains:
 *   enabled: true
 * ```
 * Creates 6 stacks in account 682475224767 (7 if delegations are configured):
 * - Organizations stack
 * - Identity Center stack
 * - RootDomain stack
 * - AcmAndWaf stack (us-east-1)
 * - CloudFrontDistribution stack (us-east-1)
 * - DnsRecords stack (management region)
 * - DomainDelegation stack (if delegations configured)
 *
 * @example Multi-environment deployment
 * ```yaml
 * deployment:
 *   accountId: "682475224767"
 *   region: us-east-1
 * environments:
 *   nprd:
 *     accountId: "466279485605"
 *     region: us-east-1
 *   prod:
 *     accountId: "719640820326"
 *     region: us-east-1
 * networking:
 *   vpc:
 *     enabled: true
 * ```
 * Creates 2 stacks (one in nprd account, one in prod account)
 *
 * @example Mixed deployment
 * ```yaml
 * deployment:
 *   accountId: "682475224767"
 *   region: us-east-1
 * environments:
 *   nprd:
 *     accountId: "466279485605"
 *   prod:
 *     accountId: "719640820326"
 * organization:
 *   enabled: true
 * domains:
 *   enabled: true
 * networking:
 *   vpc:
 *     enabled: true
 * ```
 * Creates 7 stacks total (8 if delegations are configured):
 * - Organizations stack in 682475224767
 * - RootDomain stack in 682475224767
 * - AcmAndWaf stack in 682475224767 (us-east-1)
 * - CloudFrontDistribution stack in 682475224767 (us-east-1)
 * - DnsRecords stack in 682475224767 (management region)
 * - DomainDelegation stack in 682475224767 (if delegations configured)
 * - VPC-nprd stack in 466279485605
 * - VPC-prod stack in 719640820326
 */

import type { CdkApplication } from '../cdk-application';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';
import { BaseOrchestrator, OrchestrationError } from './base-orchestrator';
import { ManagementOrganizationsStack } from '../../stacks/organizations/organizations-stack';
import { ManagementIdentityCenterStack } from '../../stacks/identity-center/identity-center-stack';
import { GitHubOidcStack } from '../../stacks/customization';
import {
  VpcStack,
  EcsClusterStack,
  EcsFargateServiceStack,
  StaticWebAppStack,
  SaasSecretsStack,
  AuroraServerlessStack,
  OriginHostedZoneStack,
} from '../../stacks/workload';
import { ResourceNaming } from '@codeiqlabs/aws-utils';
import { DomainFoundationStage, DomainWireupStage } from '../../stages/domains';

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

    const deploymentAccountId = config.deployment.accountId;
    const deploymentRegion = config.deployment.region;

    // Get naming configuration from manifest (required)
    const namingConfig = config.naming;
    const company = namingConfig.company;
    const project = namingConfig.project;
    // Owner defaults to company if not specified in manifest
    const owner = namingConfig.owner || company;

    // Create resource naming utility
    const naming = new ResourceNaming({
      company,
      project,
      environment: 'mgmt', // Management account environment is always 'mgmt'
      region: deploymentRegion,
      accountId: deploymentAccountId,
    });

    // Primary deployment environment (for single-account components)
    const primaryEnv = {
      account: deploymentAccountId,
      region: deploymentRegion,
    };

    // ========================================================================
    // SINGLE-ACCOUNT COMPONENTS
    // These deploy to the primary deployment target
    // ========================================================================

    // Create Organizations stack if enabled
    let organizationsStack: ManagementOrganizationsStack | undefined;
    if (config.organization?.enabled) {
      try {
        organizationsStack = new ManagementOrganizationsStack(
          app,
          naming.stackName('Organizations'),
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

    // Create Identity Center stack if enabled
    if (config.identityCenter?.enabled) {
      try {
        new ManagementIdentityCenterStack(app, naming.stackName('IdentityCenter'), {
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
        });
      } catch (error) {
        throw new OrchestrationError(
          'Failed to create Identity Center stack',
          'identityCenter',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    // Create Domain Management stages if enabled
    // Note: DomainWireupStage depends on DomainFoundationStage exports (certificates, WAF ACLs)
    // but we do NOT add a CDK dependency between stages because:
    // 1. CDK stages are independent deployment units
    // 2. Cross-stage dependencies are not allowed in CDK
    // 3. The deployment pipeline (GitHub Actions) should deploy stages in order
    // 4. Fn.importValue handles runtime dependencies between stacks
    if (config.domains?.enabled) {
      try {
        new DomainFoundationStage(app, naming.stackName('DomainFoundationStage'), {
          cfg: config,
          env: primaryEnv,
        });

        new DomainWireupStage(app, naming.stackName('DomainWireupStage'), {
          cfg: config,
          env: primaryEnv,
        });
      } catch (error) {
        throw new OrchestrationError(
          'Failed to create Domain Management stages',
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

        const computeConfig = (config as any).compute;
        const secretsConfig = (config as any).secrets;
        const auroraConfig = (config as any).aurora;
        const originZonesConfig = (config as any).originZones;

        // Track VPC stack for dependent stacks
        let vpcStack: VpcStack | undefined;

        // Track ECS service stacks for origin zone creation
        const ecsServiceStacks: Map<string, EcsFargateServiceStack> = new Map();

        // Networking/VPC stack (if enabled)
        if (config.networking?.vpc?.enabled) {
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

        // Secrets stack (if enabled)
        let secretsStack: SaasSecretsStack | undefined;
        if (secretsConfig?.enabled) {
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

        // ECS Cluster stack (if compute.ecs is enabled and VPC exists)
        let ecsClusterStack: EcsClusterStack | undefined;
        if (computeConfig?.ecs?.enabled && vpcStack) {
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

        if (resolvedAuroraConfig?.enabled && !vpcStack) {
          throw new OrchestrationError(
            `Aurora stack for environment ${envName} requires networking.vpc to be enabled`,
            'aurora',
            new Error('VPC stack not available for Aurora configuration'),
          );
        }

        if (resolvedAuroraConfig?.enabled && vpcStack) {
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
        if (ecsConfig?.enabled && ecsConfig?.services && vpcStack && ecsClusterStack) {
          for (const service of ecsConfig.services) {
            // Skip disabled services
            if (!service.enabled) continue;

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
                secretsStack && secretsConfig?.enabled
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

              const serviceSecrets =
                secretsStack && secretsConfig?.enabled
                  ? {
                      databaseUrlSecretArn: secretsStack.getSecret('database-url')?.secretArn,
                      databaseUrlSecretArns,
                      stripeSecretKeySecretArn:
                        secretsStack.getSecret('stripe-secret-key')?.secretArn,
                      stripeWebhookSecretArn:
                        secretsStack.getSecret('stripe-webhook-secret')?.secretArn,
                      stripePublishableKeySecretArn:
                        secretsStack.getSecret('stripe-publishable-key')?.secretArn,
                      authSecretArn: secretsStack.getSecret('auth-secret')?.secretArn,
                      googleOAuthSecretArns,
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

        // Origin Hosted Zone stack (if enabled and ECS services exist)
        // Creates origin-{env}.{brand} zones with Alias A records to ALBs
        if (originZonesConfig?.enabled && ecsServiceStacks.size > 0) {
          try {
            const brands = originZonesConfig.brands || [];
            const services = Array.from(ecsServiceStacks.entries()).map(([serviceType, stack]) => ({
              name: serviceType,
              alb: stack.alb,
            }));

            if (brands.length > 0 && services.length > 0) {
              const originZoneStack = new OriginHostedZoneStack(
                app,
                envNaming.stackName('OriginZones'),
                {
                  stackConfig,
                  originConfig: {
                    brands,
                    services,
                  },
                  env: envEnv,
                },
              );

              // Add dependencies on all ECS service stacks
              for (const serviceStack of ecsServiceStacks.values()) {
                originZoneStack.addDependency(serviceStack);
              }
            }
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create Origin Hosted Zone stack for environment ${envName}`,
              'originZones',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // Static Web App stack (if enabled)
        const staticHostingConfig = (config as any).staticHosting;
        if (staticHostingConfig?.enabled) {
          try {
            const sites = staticHostingConfig.sites || [];
            const brands = sites.map((site: { brand: string }) => site.brand);

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

    // Create GitHub OIDC stacks if githubOidc is enabled
    // These roles allow GitHub Actions to authenticate via OIDC and deploy to AWS
    const githubOidc = (config as any).githubOidc;
    const oidcTargets = githubOidc?.targets;
    if (githubOidc?.enabled && oidcTargets) {
      for (const target of oidcTargets) {
        const targetProjectName = target.projectName;
        if (target?.environments) {
          for (const environment of target.environments) {
            try {
              const envNaming = new ResourceNaming({
                company,
                project: targetProjectName,
                environment: environment.name,
                region: environment.region,
                accountId: environment.accountId,
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
                  environment: environment.name,
                  region: environment.region,
                  accountId: environment.accountId,
                  owner,
                  company,
                },
                repositories,
                ecrRepositoryPrefix: target.ecrRepositoryPrefix,
                s3BucketPrefix: target.s3BucketPrefix,
                ecsClusterPrefix: target.ecsClusterPrefix,
                env: {
                  account: environment.accountId,
                  region: environment.region,
                },
              });
            } catch (error) {
              throw new OrchestrationError(
                `Failed to create GitHub OIDC stack for ${targetProjectName}-${environment.name}`,
                'githubOidc',
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          }
        }
      }
    }
  }
}
