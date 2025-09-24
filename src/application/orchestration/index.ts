/**
 * Stage Orchestration Module Exports
 *
 * This module provides centralized exports for all stage orchestration functionality,
 * including base orchestrator patterns and specific orchestrators for management
 * and workload applications.
 */

// Base orchestrator patterns
export type { BaseOrchestrator } from './base-orchestrator';
export {
  OrchestrationError,
  validateManifestType,
  createStageIdentifier,
} from './base-orchestrator';

// Orchestrator implementations
export { ManagementOrchestrator } from './management-orchestrator';
export { WorkloadOrchestrator } from './workload-orchestrator';
