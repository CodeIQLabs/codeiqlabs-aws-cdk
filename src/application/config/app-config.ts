/**
 * Application-Level Configuration and Validation
 *
 * This module provides centralized configuration management and validation
 * for CDK applications, ensuring consistent configuration handling across
 * all factory functions and orchestrators.
 */

import type { ManifestType } from '../types';
import type { FactoryOptions } from './factory-options';

/**
 * Validated application configuration
 */
export interface AppConfig {
  /**
   * The detected or specified manifest type
   */
  manifestType: ManifestType;

  /**
   * Path to the loaded manifest file
   */
  manifestPath: string;

  /**
   * Whether global aspects should be applied automatically
   */
  autoApplyAspects: boolean;
}

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validate factory options
 *
 * @param options - Factory options to validate
 * @throws ConfigValidationError if validation fails
 */
export function validateFactoryOptions(options: FactoryOptions): void {
  if (options.expectedType && !['management', 'workload'].includes(options.expectedType)) {
    throw new ConfigValidationError(
      `Invalid expectedType: ${options.expectedType}. Must be 'management' or 'workload'`,
      'expectedType',
    );
  }

  if (options.manifestPath && typeof options.manifestPath !== 'string') {
    throw new ConfigValidationError('manifestPath must be a string', 'manifestPath');
  }

  if (options.autoApplyAspects !== undefined && typeof options.autoApplyAspects !== 'boolean') {
    throw new ConfigValidationError('autoApplyAspects must be a boolean', 'autoApplyAspects');
  }
}

/**
 * Create application configuration from factory options
 *
 * @param options - Factory options
 * @param manifestType - Detected manifest type
 * @returns Validated application configuration
 */
export function createAppConfig(options: FactoryOptions, manifestType: ManifestType): AppConfig {
  validateFactoryOptions(options);

  return {
    manifestType,
    manifestPath: options.manifestPath || 'src/manifest.yaml',
    autoApplyAspects: options.autoApplyAspects ?? true,
  };
}
