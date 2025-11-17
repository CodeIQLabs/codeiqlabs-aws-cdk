/**
 * Unified Application Factory
 *
 * This module provides a single unified factory function for creating CDK applications
 * with component-based orchestration. This replaces the previous manifestType-based
 * approach (createManagementApp/createWorkloadApp) with a simpler, more flexible design.
 *
 * **Breaking Change:**
 * - No more manifestType field in manifests
 * - Single createApp() function replaces createManagementApp() and createWorkloadApp()
 * - Component-based orchestration replaces manifestType-based orchestration
 * - Any component can be deployed to any account
 */

import type { CdkApplication } from '../cdk-application';
import type { FactoryOptions } from '../config/factory-options';
import { ComponentOrchestrator } from '../orchestration/component-orchestrator';
import { createConfiguredApplication, FactoryError } from './factory-utils';

/**
 * Create a CDK application with component-based orchestration
 *
 * This function automatically:
 * 1. Loads and validates the manifest
 * 2. Detects which components are enabled
 * 3. Creates appropriate stacks based on enabled components
 * 4. Returns a fully configured CDK application ready for synthesis
 *
 * **What Gets Deployed:**
 * - Single-account components (organization, identityCenter, domains) → deployment.accountId
 * - Multi-environment components (staticHosting, networking) → environments[*].accountId
 *
 * **Deployment Options:**
 * - `cdk deploy --all` - Deploy all enabled component stacks
 * - `cdk deploy <StackName>` - Deploy individual stack
 * - `cdk list` - See all stacks that will be created
 *
 * @param options - Optional configuration
 * @returns Promise resolving to the configured CdkApplication
 *
 * @example Single-account deployment (management infrastructure)
 * ```typescript
 * // manifest.yaml:
 * // deployment:
 * //   accountId: "682475224767"
 * //   region: us-east-1
 * // organization:
 * //   enabled: true
 * // identityCenter:
 * //   enabled: true
 * // domains:
 * //   enabled: true
 *
 * import { createApp } from '@codeiqlabs/aws-cdk';
 *
 * createApp().then(app => app.synth());
 *
 * // Creates 3 stacks in account 682475224767:
 * // - CodeIQLabs-Management-Organizations-Stack
 * // - CodeIQLabs-Management-Identity-Center-Stack
 * // - CodeIQLabs-Management-Domain-Delegation-Stack
 * ```
 *
 * @example Multi-environment deployment (workload infrastructure)
 * ```typescript
 * // manifest.yaml:
 * // deployment:
 * //   accountId: "682475224767"
 * //   region: us-east-1
 * // environments:
 * //   nprd:
 * //     accountId: "466279485605"
 * //     region: us-east-1
 * //   prod:
 * //     accountId: "719640820326"
 * //     region: us-east-1
 * // staticHosting:
 * //   enabled: true
 *
 * import { createApp } from '@codeiqlabs/aws-cdk';
 *
 * createApp().then(app => app.synth());
 *
 * // Creates 2 stacks:
 * // - CodeIQLabs-StaticHosting-nprd-Stack in account 466279485605
 * // - CodeIQLabs-StaticHosting-prod-Stack in account 719640820326
 * ```
 *
 * @example Mixed deployment (management + workload in same manifest)
 * ```typescript
 * // manifest.yaml:
 * // deployment:
 * //   accountId: "682475224767"
 * //   region: us-east-1
 * // environments:
 * //   nprd:
 * //     accountId: "466279485605"
 * //   prod:
 * //     accountId: "719640820326"
 * // organization:
 * //   enabled: true
 * // domains:
 * //   enabled: true
 * // staticHosting:
 * //   enabled: true
 *
 * import { createApp } from '@codeiqlabs/aws-cdk';
 *
 * createApp().then(app => app.synth());
 *
 * // Creates 4 stacks total:
 * // - Organizations stack in 682475224767
 * // - Domains stack in 682475224767
 * // - StaticHosting-nprd stack in 466279485605
 * // - StaticHosting-prod stack in 719640820326
 * ```
 */
export async function createApp(options: FactoryOptions = {}): Promise<CdkApplication> {
  try {
    // Create CDK application (no expectedType - we don't validate manifestType anymore)
    const app = await createConfiguredApplication(options);

    // Create stacks based on enabled components
    const orchestrator = new ComponentOrchestrator();
    orchestrator.createStages(app);

    return app;
  } catch (error) {
    throw new FactoryError(
      'Failed to create application',
      'createApp',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
