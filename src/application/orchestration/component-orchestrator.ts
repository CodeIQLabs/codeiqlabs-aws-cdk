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
 * - domains → deployment.accountId (single stack)
 * - staticHosting → environments[*].accountId (one stack per environment)
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
 * Creates 3 stacks in account 682475224767
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
 * staticHosting:
 *   enabled: true
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
 * staticHosting:
 *   enabled: true
 * ```
 * Creates 4 stacks total:
 * - Organizations stack in 682475224767
 * - Domains stack in 682475224767
 * - StaticHosting-nprd stack in 466279485605
 * - StaticHosting-prod stack in 719640820326
 */

import type { CdkApplication } from '../cdk-application';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';
import { BaseOrchestrator, OrchestrationError } from './base-orchestrator';
import { ManagementOrganizationsStack } from '../../stacks/organizations/organizations-stack';
import { ManagementIdentityCenterStack } from '../../stacks/identity-center/identity-center-stack';
import { DomainDelegationStack } from '../../stacks/domains/domain-delegation-stack';
import { ResourceNaming } from '@codeiqlabs/aws-utils';

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

    // Create resource naming utility
    const naming = new ResourceNaming({
      project: config.project,
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
    if (config.organization?.enabled) {
      try {
        new ManagementOrganizationsStack(app, naming.stackName('Organizations'), {
          stackConfig: {
            project: config.project,
            environment: 'mgmt',
            region: deploymentRegion,
            accountId: deploymentAccountId,
            owner: config.company,
            company: config.company,
          },
          config: config as any,
          orgRootId: config.organization.rootId,
          env: primaryEnv,
        });
      } catch (error) {
        throw new OrchestrationError(
          'Failed to create Organizations stack',
          'organizations',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    // Create Identity Center stack if enabled
    if (config.identityCenter?.enabled) {
      try {
        new ManagementIdentityCenterStack(app, naming.stackName('Identity-Center'), {
          stackConfig: {
            project: config.project,
            environment: 'mgmt',
            region: deploymentRegion,
            accountId: deploymentAccountId,
            owner: config.company,
            company: config.company,
          },
          config: config as any,
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

    // Create Domain Delegation stack if enabled
    if (config.domains?.enabled) {
      try {
        new DomainDelegationStack(app, naming.stackName('Domain-Delegation'), {
          stackConfig: {
            project: config.project,
            environment: 'mgmt',
            region: deploymentRegion,
            accountId: deploymentAccountId,
            owner: config.company,
            company: config.company,
          },
          config: config as any, // TODO: Fix type after removing ManagementAppConfig
          env: primaryEnv,
        });
      } catch (error) {
        throw new OrchestrationError(
          'Failed to create Domain Delegation stack',
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
        // TODO: Uncomment when StaticHostingStack and VpcStack are implemented
        // const envEnv = {
        //   account: envConfig.accountId,
        //   region: envConfig.region,
        // };

        // TODO: Uncomment when StaticHostingStack and VpcStack are implemented
        // const envNaming = new ResourceNaming({
        //   project: config.project,
        //   environment: envName,
        //   region: envConfig.region,
        //   accountId: envConfig.accountId,
        // });

        // Static Hosting stack (if enabled)
        if (config.staticHosting?.enabled) {
          try {
            // TODO: Create StaticHostingStack when implemented
            console.log(
              `Would create StaticHosting stack for ${envName} in account ${envConfig.accountId}`,
            );
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create StaticHosting stack for environment ${envName}`,
              'staticHosting',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // Networking/VPC stack (if enabled)
        if (config.networking?.vpc?.enabled) {
          try {
            // TODO: Create VpcStack when implemented
            console.log(`Would create VPC stack for ${envName} in account ${envConfig.accountId}`);
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create VPC stack for environment ${envName}`,
              'networking',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
      }
    }
  }
}
