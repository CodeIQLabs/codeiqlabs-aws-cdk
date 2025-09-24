/**
 * Workload Orchestrator
 *
 * This module implements workload stage creation logic using the workload
 * stage registry. It coordinates between pattern detection and stage creation
 * for workload account infrastructure.
 */

import type { CdkApplication } from '../cdk-application';
import { detectWorkloadPattern, type WorkloadConfig } from '../../detection/workload-detector';
import {
  WorkloadStageRegistry,
  type WorkloadStageConstructor,
} from '../registry/workload-stage-registry';
import {
  BaseOrchestrator,
  OrchestrationError,
  validateManifestType,
  createStageIdentifier,
} from './base-orchestrator';

/**
 * Orchestrator for workload stage creation
 *
 * This class coordinates between workload pattern detection and stage creation,
 * using the workload stage registry to dynamically look up and instantiate
 * the appropriate stage classes based on detected patterns.
 *
 * @example
 * ```typescript
 * const orchestrator = new WorkloadOrchestrator();
 * orchestrator.createStages(app);
 * ```
 */
export class WorkloadOrchestrator implements BaseOrchestrator<WorkloadConfig> {
  private registry = new WorkloadStageRegistry();

  /**
   * Create workload stages based on detected pattern
   *
   * @param app - CDK application instance
   * @throws OrchestrationError if stage creation fails
   */
  createStages(app: CdkApplication): void {
    // Validate that this is a workload application
    validateManifestType(app, 'workload');

    const workloadConfig = app.config as WorkloadConfig;
    const pattern = detectWorkloadPattern(workloadConfig);

    // Create stages for the detected pattern
    this.createStagesForPattern(app, workloadConfig, pattern);
  }

  /**
   * Create stages for a specific workload pattern
   *
   * @param app - CDK application instance
   * @param workloadConfig - Workload configuration
   * @param pattern - Detected workload pattern
   * @throws OrchestrationError if stage creation fails
   */
  private createStagesForPattern(
    app: CdkApplication,
    workloadConfig: WorkloadConfig,
    pattern: string,
  ): void {
    const stageClass = this.registry.getStage(pattern);

    if (!stageClass) {
      throw new OrchestrationError(`No stage registered for workload pattern: ${pattern}`, pattern);
    }

    // Create stages for each environment
    for (const [envName] of Object.entries(workloadConfig.environments)) {
      this.createStageForEnvironment(app, envName, stageClass, pattern);
    }
  }

  /**
   * Create a stage for a specific environment
   *
   * @param app - CDK application instance
   * @param envName - Environment name
   * @param stageClass - Stage constructor class
   * @param pattern - Workload pattern name
   * @throws OrchestrationError if stage creation fails
   */
  private createStageForEnvironment(
    app: CdkApplication,
    envName: string,
    stageClass: WorkloadStageConstructor,
    pattern: string,
  ): void {
    try {
      app.createWorkloadStage(envName, stageClass);
    } catch (error) {
      const stageIdentifier = createStageIdentifier(pattern, stageClass.name);
      throw new OrchestrationError(
        `Failed to create workload stage for environment '${envName}': ${stageIdentifier}`,
        pattern,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
