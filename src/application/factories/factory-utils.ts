/**
 * Shared Factory Utilities
 *
 * This module provides shared utilities and patterns used by factory functions,
 * promoting code reuse and consistent behavior across all application factories.
 */

import { CdkApplication } from '../cdk-application';
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
