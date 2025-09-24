/**
 * Shared Registry Type Definitions
 *
 * This module defines types used by both management and workload stage registries
 * for type-safe stage registration and lookup functionality.
 */

import type * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type {
  EnhancedManagementStageProps,
  EnhancedWorkloadStageProps,
} from '../../stages/stage-types';

/**
 * Constructor type for management stages
 */
export type ManagementStageConstructor<T extends cdk.Stage = cdk.Stage> = new (
  scope: Construct,
  id: string,
  props: EnhancedManagementStageProps,
) => T;

/**
 * Constructor type for workload stages
 */
export type WorkloadStageConstructor<T extends cdk.Stage = cdk.Stage> = new (
  scope: Construct,
  id: string,
  props: EnhancedWorkloadStageProps,
) => T;

/**
 * Interface for management stage registry
 */
export interface ManagementStageRegistryInterface {
  /**
   * Register a management stage for a specific component
   */
  registerStage(component: string, stageClass: ManagementStageConstructor): void;

  /**
   * Get a management stage class for a specific component
   */
  getStage(component: string): ManagementStageConstructor | undefined;

  /**
   * Get management stage classes for multiple components
   */
  getStagesForComponents(components: string[]): Map<string, ManagementStageConstructor>;

  /**
   * List all registered management components
   */
  listRegisteredComponents(): string[];
}

/**
 * Interface for workload stage registry
 */
export interface WorkloadStageRegistryInterface {
  /**
   * Register a workload stage for a specific pattern
   */
  registerStage(pattern: string, stageClass: WorkloadStageConstructor): void;

  /**
   * Get a workload stage class for a specific pattern
   */
  getStage(pattern: string): WorkloadStageConstructor | undefined;

  /**
   * List all registered workload patterns
   */
  listRegisteredPatterns(): string[];
}
