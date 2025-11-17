/**
 * Base Orchestrator with Shared Patterns
 *
 * This module provides shared orchestration patterns and utilities that are
 * common to both management and workload orchestrators, promoting code reuse
 * and consistent orchestration behavior.
 */

import type { CdkApplication } from '../cdk-application';

/**
 * Base orchestrator interface
 */
export interface BaseOrchestrator {
  /**
   * Create stages for the given application and configuration
   */
  createStages(app: CdkApplication): void;
}

/**
 * Orchestration error for stage creation failures
 */
export class OrchestrationError extends Error {
  constructor(
    message: string,
    public readonly component?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'OrchestrationError';
  }
}

/**
 * Create a stage name for logging and error reporting
 *
 * @param component - Component or pattern name
 * @param stageName - Stage class name
 * @returns Formatted stage identifier
 */
export function createStageIdentifier(component: string, stageName: string): string {
  return `${component}:${stageName}`;
}
