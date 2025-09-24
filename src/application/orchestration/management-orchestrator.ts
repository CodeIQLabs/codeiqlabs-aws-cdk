/**
 * Management Orchestrator
 *
 * This module implements management stage creation logic using the management
 * stage registry. It coordinates between component detection and stage creation
 * for management account infrastructure.
 */

import type { CdkApplication } from '../cdk-application';
import {
  detectManagementComponents,
  type ManagementConfig,
} from '../../detection/management-detector';
import { ManagementStageRegistry } from '../registry/management-stage-registry';
import {
  BaseOrchestrator,
  OrchestrationError,
  validateManifestType,
  createStageIdentifier,
} from './base-orchestrator';

/**
 * Orchestrator for management stage creation
 *
 * This class coordinates between management component detection and stage creation,
 * using the management stage registry to dynamically look up and instantiate
 * the appropriate stage classes based on detected components.
 *
 * @example
 * ```typescript
 * const orchestrator = new ManagementOrchestrator();
 * orchestrator.createStages(app);
 * ```
 */
export class ManagementOrchestrator implements BaseOrchestrator<ManagementConfig> {
  private registry = new ManagementStageRegistry();

  /**
   * Create management stages based on detected components
   *
   * @param app - CDK application instance
   * @throws OrchestrationError if stage creation fails
   */
  createStages(app: CdkApplication): void {
    // Validate that this is a management application
    validateManifestType(app, 'management');

    const managementConfig = app.config as ManagementConfig;
    const components = detectManagementComponents(managementConfig);

    // Create stages for each detected component
    for (const component of components) {
      this.createStageForComponent(app, component);
    }
  }

  /**
   * Create a stage for a specific management component
   *
   * @param app - CDK application instance
   * @param component - Management component name
   * @throws OrchestrationError if stage creation fails
   */
  private createStageForComponent(app: CdkApplication, component: string): void {
    const stageClass = this.registry.getStage(component);

    if (!stageClass) {
      throw new OrchestrationError(
        `No stage registered for management component: ${component}`,
        component,
      );
    }

    try {
      app.createManagementStage(stageClass);
    } catch (error) {
      const stageIdentifier = createStageIdentifier(component, stageClass.name);
      throw new OrchestrationError(
        `Failed to create management stage: ${stageIdentifier}`,
        component,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
