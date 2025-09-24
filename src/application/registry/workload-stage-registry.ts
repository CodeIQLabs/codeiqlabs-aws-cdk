/**
 * Workload Stage Registry
 *
 * This module provides pattern-based stage registration and lookup for workload stages.
 * It maintains a registry of stage classes mapped to workload patterns and provides
 * type-safe access to registered stages.
 */

import type {
  WorkloadStageConstructor,
  WorkloadStageRegistryInterface,
} from './stage-registry-types';

// Import workload stage classes
import { StaticHostingStage } from '../../stages/workload/static-hosting-stage';

/**
 * Registry for workload stage classes with pattern-based lookup
 *
 * This class provides a centralized registry for workload stages, allowing
 * orchestrators to dynamically look up stage classes based on detected patterns
 * without hard-coding stage imports in orchestration logic.
 *
 * @example
 * ```typescript
 * const registry = new WorkloadStageRegistry();
 * const stageClass = registry.getStage('static-hosting');
 * if (stageClass) {
 *   app.createWorkloadStage(envName, stageClass);
 * }
 * ```
 */
export class WorkloadStageRegistry implements WorkloadStageRegistryInterface {
  private stages = new Map<string, WorkloadStageConstructor>();

  constructor() {
    // Register default workload stages
    this.registerStage('static-hosting', StaticHostingStage);
  }

  /**
   * Register a workload stage for a specific pattern
   *
   * @param pattern - The pattern name (e.g., 'static-hosting')
   * @param stageClass - The workload stage constructor class
   */
  registerStage(pattern: string, stageClass: WorkloadStageConstructor): void {
    this.stages.set(pattern, stageClass);
  }

  /**
   * Get a workload stage class for a specific pattern
   *
   * @param pattern - The pattern name to look up
   * @returns The stage constructor class or undefined if not found
   */
  getStage(pattern: string): WorkloadStageConstructor | undefined {
    return this.stages.get(pattern);
  }

  /**
   * List all registered workload patterns
   *
   * @returns Array of registered pattern names
   */
  listRegisteredPatterns(): string[] {
    return Array.from(this.stages.keys());
  }
}
