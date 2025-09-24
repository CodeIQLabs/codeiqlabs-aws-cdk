/**
 * Shared Factory Utilities
 *
 * This module provides shared utilities and patterns used by factory functions,
 * promoting code reuse and consistent behavior across all application factories.
 */

import type { CdkApplication } from '../cdk-application';
import type { FactoryOptions } from '../config/factory-options';
import { mergeFactoryOptions } from '../config/factory-options';

/**
 * Factory creation error
 */
export class FactoryError extends Error {
  constructor(
    message: string,
    public readonly factoryType?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'FactoryError';
  }
}

/**
 * Create and configure a CDK application with merged options
 *
 * @param options - Factory options
 * @returns Promise resolving to configured CDK application
 * @throws FactoryError if application creation fails
 */
export async function createConfiguredApplication(
  options: FactoryOptions = {},
): Promise<CdkApplication> {
  try {
    // Merge options with defaults
    const mergedOptions = mergeFactoryOptions(options);

    // Create CDK application
    const app = await CdkApplication.create({
      expectedType: mergedOptions.expectedType,
      manifestPath: mergedOptions.manifestPath,
      appProps: mergedOptions.appProps,
      autoApplyAspects: mergedOptions.autoApplyAspects,
    });

    return app;
  } catch (error) {
    throw new FactoryError(
      'Failed to create CDK application',
      undefined,
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Validate that the application has the expected manifest type
 *
 * @param app - CDK application to validate
 * @param expectedType - Expected manifest type
 * @param factoryName - Name of the factory for error reporting
 * @throws FactoryError if validation fails
 */
export function validateApplicationType(
  app: CdkApplication,
  expectedType: 'management' | 'workload',
  factoryName: string,
): void {
  if (app.manifestType !== expectedType) {
    throw new FactoryError(
      `${factoryName} requires ${expectedType} manifest but got ${app.manifestType}`,
      factoryName,
    );
  }
}
