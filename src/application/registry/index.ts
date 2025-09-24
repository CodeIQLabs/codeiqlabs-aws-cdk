/**
 * Stage Registry Module Exports
 *
 * This module provides centralized exports for all stage registry functionality,
 * including both management and workload stage registries and their type definitions.
 */

// Registry implementations
export { ManagementStageRegistry } from './management-stage-registry';
export { WorkloadStageRegistry } from './workload-stage-registry';

// Type definitions
export type {
  ManagementStageConstructor,
  WorkloadStageConstructor,
  ManagementStageRegistryInterface,
  WorkloadStageRegistryInterface,
} from './stage-registry-types';
