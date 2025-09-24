/**
 * Main Factory Functions
 *
 * This module implements the main factory functions for creating CDK applications
 * with automatic pattern detection and stage orchestration. These functions provide
 * the primary entry points for the modular architecture.
 */

import type { CdkApplication } from '../cdk-application';
import type { FactoryOptions } from '../config/factory-options';
import { ManagementOrchestrator } from '../orchestration/management-orchestrator';
import { WorkloadOrchestrator } from '../orchestration/workload-orchestrator';
import {
  createConfiguredApplication,
  validateApplicationType,
  FactoryError,
} from './factory-utils';

/**
 * Create a CDK application with automatic pattern detection
 *
 * This function automatically:
 * 1. Loads and validates the manifest
 * 2. Detects the infrastructure pattern (management vs workload)
 * 3. Creates appropriate stages based on the detected pattern
 * 4. Returns a fully configured CDK application ready for synthesis
 *
 * @param options - Optional configuration
 * @returns Promise resolving to the configured CdkApplication
 *
 * @example
 * ```typescript
 * // Simple one-liner for any infrastructure pattern
 * import { createAutoApp } from '@codeiqlabs/aws-cdk/application/factories';
 *
 * createAutoApp().then(app => app.synth());
 * ```
 */
export async function createAutoApp(options: FactoryOptions = {}): Promise<CdkApplication> {
  try {
    // Create CDK application with auto-detection
    const app = await createConfiguredApplication(options);

    // Auto-create stages based on detected manifest type
    switch (app.manifestType) {
      case 'management': {
        const managementOrchestrator = new ManagementOrchestrator();
        managementOrchestrator.createStages(app);
        break;
      }
      case 'workload': {
        const workloadOrchestrator = new WorkloadOrchestrator();
        workloadOrchestrator.createStages(app);
        break;
      }
      default:
        throw new FactoryError(`Unsupported manifest type: ${app.manifestType}`, 'createAutoApp');
    }

    return app;
  } catch (error) {
    throw new FactoryError(
      'Failed to create auto-detected application',
      'createAutoApp',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Create a management application with auto-detection
 *
 * Specialized factory for management account infrastructure.
 * Validates that the manifest is a management type and creates
 * appropriate management stages automatically.
 *
 * @param options - Optional configuration
 * @returns Promise resolving to the configured management application
 *
 * @example
 * ```typescript
 * // For management accounts
 * import { createManagementApp } from '@codeiqlabs/aws-cdk/application/factories';
 *
 * createManagementApp().then(app => app.synth());
 * ```
 */
export async function createManagementApp(options: FactoryOptions = {}): Promise<CdkApplication> {
  try {
    const app = await createConfiguredApplication({
      ...options,
      expectedType: 'management', // Enforce management type
    });

    // Validate manifest type
    validateApplicationType(app, 'management', 'createManagementApp');

    // Create management stages based on detected components
    const managementOrchestrator = new ManagementOrchestrator();
    managementOrchestrator.createStages(app);

    return app;
  } catch (error) {
    throw new FactoryError(
      'Failed to create management application',
      'createManagementApp',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Create a workload application with auto-detection
 *
 * Specialized factory for workload account infrastructure.
 * Validates that the manifest is a workload type and creates
 * stages for all defined environments automatically.
 *
 * @param options - Optional configuration
 * @returns Promise resolving to the configured workload application
 *
 * @example
 * ```typescript
 * // For workload accounts (websites, applications, etc.)
 * import { createWorkloadApp } from '@codeiqlabs/aws-cdk/application/factories';
 *
 * createWorkloadApp().then(app => app.synth());
 * ```
 */
export async function createWorkloadApp(options: FactoryOptions = {}): Promise<CdkApplication> {
  try {
    const app = await createConfiguredApplication({
      ...options,
      expectedType: 'workload', // Enforce workload type
    });

    // Validate manifest type
    validateApplicationType(app, 'workload', 'createWorkloadApp');

    // Create workload stages based on detected pattern
    const workloadOrchestrator = new WorkloadOrchestrator();
    workloadOrchestrator.createStages(app);

    return app;
  } catch (error) {
    throw new FactoryError(
      'Failed to create workload application',
      'createWorkloadApp',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
