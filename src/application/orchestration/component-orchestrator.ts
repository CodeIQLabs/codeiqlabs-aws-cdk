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
 * - Supports `cdk deploy --all` and `cdk deploy <StackName>`
 * - Clean, discoverable stack names
 *
 * **What Gets Deployed Where:**
 * - organization → deployment.accountId (single stack)
 * - identityCenter → deployment.accountId (single stack)
 * - domains → deployment.accountId (4 stacks: RootDomain, CloudFrontAndCert, DnsRecords, DomainDelegation)
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
 * Creates 6 stacks in account 682475224767:
 * - Organizations stack
 * - Identity Center stack
 * - RootDomain stack
 * - CloudFrontAndCert stack (us-east-1)
 * - DnsRecords stack
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
 * Creates 8 stacks total:
 * - Organizations stack in 682475224767
 * - RootDomain stack in 682475224767
 * - CloudFrontAndCert stack in 682475224767 (us-east-1)
 * - DnsRecords stack in 682475224767
 * - DomainDelegation stack in 682475224767 (if delegations configured)
 * - VPC-nprd stack in 466279485605
 * - VPC-prod stack in 719640820326
 */

import type { CdkApplication } from '../cdk-application';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';
import { BaseOrchestrator, OrchestrationError } from './base-orchestrator';
import { ManagementOrganizationsStack } from '../../stacks/organizations/organizations-stack';
import { ManagementIdentityCenterStack } from '../../stacks/identity-center/identity-center-stack';
import { OriginDiscoveryReadRoleStack, GitHubOidcStack } from '../../stacks/customization';
import {
  VpcStack,
  EcsClusterStack,
  EcsFargateServiceStack,
  StaticWebAppStack,
  SaasSecretsStack,
} from '../../stacks/workload';
import { ResourceNaming } from '@codeiqlabs/aws-utils';
import { DomainFoundationStage, DomainWireupStage } from '../../stages/domains';

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
              owner: company,
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
            owner: company,
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
          owner: company,
          company,
        };

        // Track VPC stack for dependent stacks
        let vpcStack: VpcStack | undefined;

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

        // ECS Cluster stack (if compute.ecs is enabled and VPC exists)
        let ecsClusterStack: EcsClusterStack | undefined;
        const computeConfig = (config as any).compute;
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

        // Marketing ECS Fargate Service stack (if enabled)
        if (computeConfig?.ecs?.marketing?.enabled && vpcStack && ecsClusterStack) {
          try {
            const marketingConfig = computeConfig.ecs.marketing;
            const marketingStack = new EcsFargateServiceStack(
              app,
              envNaming.stackName('Marketing'),
              {
                stackConfig,
                vpc: vpcStack.vpc,
                cluster: ecsClusterStack.cluster,
                albSecurityGroup: vpcStack.albSecurityGroup,
                ecsSecurityGroup: vpcStack.ecsSecurityGroup,
                serviceConfig: {
                  appKind: 'Marketing',
                  brands: marketingConfig.brands || [
                    'codeiqlabs',
                    'savvue',
                    'timisly',
                    'realtava',
                    'equitrio',
                  ],
                  managementAccountId: computeConfig.ecs.managementAccountId || deploymentAccountId,
                  certificateArn: computeConfig.ecs.certificateArn || '',
                  defaultBrand: marketingConfig.defaultBrand || 'codeiqlabs',
                  defaultContainerPort: marketingConfig.containerPort,
                  defaultHealthCheckPath: marketingConfig.healthCheckPath,
                  defaultDesiredCount: marketingConfig.desiredCount,
                  defaultCpu: marketingConfig.cpu,
                  defaultMemoryMiB: marketingConfig.memoryMiB,
                },
                env: envEnv,
              },
            );
            marketingStack.addDependency(ecsClusterStack);
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create Marketing ECS stack for environment ${envName}`,
              'compute',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // API ECS Fargate Service stack (if enabled)
        if (computeConfig?.ecs?.api?.enabled && vpcStack && ecsClusterStack) {
          try {
            const apiConfig = computeConfig.ecs.api;
            const apiStack = new EcsFargateServiceStack(app, envNaming.stackName('API'), {
              stackConfig,
              vpc: vpcStack.vpc,
              cluster: ecsClusterStack.cluster,
              albSecurityGroup: vpcStack.albSecurityGroup,
              ecsSecurityGroup: vpcStack.ecsSecurityGroup,
              serviceConfig: {
                appKind: 'API',
                brands: ['api'], // Single API service
                managementAccountId: computeConfig.ecs.managementAccountId || deploymentAccountId,
                certificateArn: computeConfig.ecs.certificateArn || '',
                defaultBrand: 'api',
                defaultContainerPort: apiConfig.containerPort || 3000,
                defaultHealthCheckPath: apiConfig.healthCheckPath || '/health',
                defaultDesiredCount: apiConfig.desiredCount,
                defaultCpu: apiConfig.cpu,
                defaultMemoryMiB: apiConfig.memoryMiB,
              },
              env: envEnv,
            });
            apiStack.addDependency(ecsClusterStack);
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create API ECS stack for environment ${envName}`,
              'compute',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // Static Web App stack (if enabled)
        const staticHostingConfig = (config as any).staticHosting;
        if (staticHostingConfig?.enabled) {
          try {
            const webApps = staticHostingConfig.webApps || [];
            const brands = webApps.map((app: { brand: string }) => app.brand);

            if (brands.length > 0) {
              new StaticWebAppStack(app, envNaming.stackName('WebApp'), {
                stackConfig,
                webAppConfig: {
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

        // Secrets stack (if enabled)
        const secretsConfig = (config as any).secrets;
        if (secretsConfig?.enabled) {
          try {
            new SaasSecretsStack(app, envNaming.stackName('Secrets'), {
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
      }
    }

    // ========================================================================
    // ALB ORIGIN DISCOVERY COMPONENTS
    // These deploy cross-account roles to workload accounts for ALB origin discovery
    // ========================================================================

    // Create Origin Discovery Read Role stacks if albOriginDiscovery is enabled
    // These roles allow the Management account's Lambda to read SSM parameters
    // from workload accounts for origin discovery (ALB DNS names)
    const albOriginDiscovery = (config as any).albOriginDiscovery;
    const albTargets = albOriginDiscovery?.targets;
    if (albOriginDiscovery?.enabled && albTargets) {
      // Get SSM parameter prefix from config or use default
      const ssmParameterPrefix = albOriginDiscovery.ssmParameterPrefix || '/codeiqlabs/*';

      // Create Origin Discovery Read Roles for each target project's environments
      for (const target of albTargets) {
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

              new OriginDiscoveryReadRoleStack(app, envNaming.stackName('OriginDiscovery'), {
                stackConfig: {
                  project: targetProjectName,
                  environment: environment.name,
                  region: environment.region,
                  accountId: environment.accountId,
                  owner: company,
                  company,
                },
                managementAccountId: deploymentAccountId,
                ssmParameterPathPrefix: ssmParameterPrefix,
                env: {
                  account: environment.accountId,
                  region: environment.region,
                },
              });
            } catch (error) {
              throw new OrchestrationError(
                `Failed to create Origin Discovery Read Role stack for ${targetProjectName}-${environment.name}`,
                'albOriginDiscovery',
                error instanceof Error ? error : new Error(String(error)),
              );
            }
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
                (repo: { owner: string; repo: string; branch?: string; allowTags?: boolean }) => ({
                  owner: repo.owner,
                  repo: repo.repo,
                  branch: repo.branch || 'main',
                  allowTags: repo.allowTags !== false,
                }),
              );

              new GitHubOidcStack(app, envNaming.stackName('GitHubOIDC'), {
                stackConfig: {
                  project: targetProjectName,
                  environment: environment.name,
                  region: environment.region,
                  accountId: environment.accountId,
                  owner: company,
                  company,
                },
                repositories,
                ecrRepositoryPrefix: target.ecrRepositoryPrefix || 'codeiqlabs-saas',
                s3BucketPrefix: target.s3BucketPrefix || 'codeiqlabs-saas',
                ecsClusterPrefix: target.ecsClusterPrefix || 'codeiqlabs-saas',
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
