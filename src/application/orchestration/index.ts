/**
 * Component Orchestration Module Exports
 *
 * This module provides centralized exports for component-based orchestration.
 */

// Base orchestrator patterns
export type { BaseOrchestrator } from './base-orchestrator';
export { OrchestrationError, createStageIdentifier } from './base-orchestrator';

// Unified component-based orchestrator
export { ComponentOrchestrator } from './component-orchestrator';
