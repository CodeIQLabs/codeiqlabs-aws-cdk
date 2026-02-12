/**
 * Component-Based Orchestrator (Thin Dispatcher)
 *
 * Unified orchestrator that detects enabled components in the manifest and
 * delegates to pattern-specific orchestrators. Shared stacks (Organizations,
 * Identity Center, GitHub OIDC) are created directly here.
 *
 * **Key Principles:**
 * - Presence implies enabled - if a section exists, it's deployed
 * - Pattern detection delegates to specialized orchestrators
 * - Shared stacks remain in this dispatcher
 *
 * **Architecture:**
 * - Creates shared stacks directly in the App
 * - Delegates pattern-specific stacks to ServerlessSaasOrchestrator
 * - Deploy with `cdk deploy <StackName ...>`; discover via `cdk list`
 *
 * **What Gets Deployed Where:**
 * - organization → mgmt account (shared - this dispatcher)
 * - identityCenter → mgmt account (shared - this dispatcher)
 * - githubOidc → workload accounts (shared - this dispatcher)
 * - infrastructure/domains/saasEdge/saasWorkload → ServerlessSaasOrchestrator
 */

import type { CdkApplication } from '../cdk-application';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';
import { BaseOrchestrator, OrchestrationError } from './base-orchestrator';
import { ManagementOrganizationsStack } from '../../stacks/organizations/organizations-stack';
import { ManagementIdentityCenterStack } from '../../stacks/identity-center/identity-center-stack';
import { GitHubOidcStack } from '../../stacks/customization';
import { ServerlessSaasOrchestrator } from '../../patterns/serverless-saas/orchestrator';
import { ResourceNaming } from '@codeiqlabs/aws-utils';

/**
 * Unified component-based orchestrator
 *
 * Detects enabled components in the manifest and delegates to the appropriate
 * pattern orchestrator. Shared infrastructure (Organizations, Identity Center,
 * GitHub OIDC) is created directly by this dispatcher.
 *
 * @example
 * ```typescript
 * import { createApp } from '@codeiqlabs/aws-cdk';
 * createApp().then(app => app.synth());
 * ```
 */
export class ComponentOrchestrator implements BaseOrchestrator {
  /**
   * Create infrastructure stacks based on enabled components
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
    const owner = namingConfig.owner || company;
    const skipEnvironmentName = (namingConfig as any).skipEnvironmentName === true;

    // Create resource naming utility
    const naming = new ResourceNaming({
      company,
      project,
      environment: 'mgmt',
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
    // SHARED COMPONENTS (pattern-agnostic)
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
    let accountIds: Record<string, string> = {};
    if (organizationsStack) {
      accountIds = organizationsStack.accountIds;
    } else if (config.organization?.organizationalUnits) {
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
            accountIds,
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
    // PATTERN DELEGATION
    // Detect which pattern applies and delegate to the appropriate orchestrator
    // ========================================================================

    const hasSaasPattern = !!(
      (config as any).saasWorkload ||
      (config as any).saasEdge ||
      (config as any).infrastructure ||
      config.domains
    );

    if (hasSaasPattern) {
      const saasOrchestrator = new ServerlessSaasOrchestrator();
      saasOrchestrator.orchestrate({
        app,
        config,
        targetEnvFilter,
        naming,
        mgmtStackNameOptions: mgmtStackNameOptions as { skipEnvironment: boolean } | undefined,
        company,
        project,
        owner,
        primaryEnv,
        deploymentAccountId,
        deploymentRegion,
      });
    }

    // ========================================================================
    // GITHUB OIDC COMPONENTS (shared - not pattern-specific)
    // ========================================================================

    const githubOidc = (config as any).githubOidc;
    const oidcTargets = githubOidc?.targets;
    if (githubOidc && oidcTargets) {
      for (const target of oidcTargets) {
        const targetProjectName = target.projectName;
        const targetEnvNames = target.targetEnvironments || [];

        for (const envName of targetEnvNames) {
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
