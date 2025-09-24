/**
 * Factory Function Option Types and Defaults
 *
 * This module defines option types and default values for factory functions,
 * providing centralized configuration management for application creation.
 */

import type * as cdk from 'aws-cdk-lib';
import type { ManifestType } from '../types';

/**
 * Options for factory functions
 */
export interface FactoryOptions {
  /**
   * Expected manifest type for validation
   * If provided, the application will validate that the loaded manifest matches this type
   * If not provided, the type will be auto-detected from the manifest structure
   */
  expectedType?: ManifestType;

  /**
   * Path to the manifest file
   * Defaults to 'src/manifest.yaml'
   */
  manifestPath?: string;

  /**
   * Standard CDK App properties
   */
  appProps?: cdk.AppProps;

  /**
   * Whether to apply global aspects automatically
   * Defaults to true
   */
  autoApplyAspects?: boolean;
}

/**
 * Default factory options
 */
export const DEFAULT_FACTORY_OPTIONS: Partial<FactoryOptions> = {
  manifestPath: 'src/manifest.yaml',
  autoApplyAspects: true,
};

/**
 * Merge user options with defaults
 *
 * @param options - User-provided options
 * @returns Merged options with defaults applied
 */
export function mergeFactoryOptions(options: FactoryOptions = {}): FactoryOptions {
  return {
    ...DEFAULT_FACTORY_OPTIONS,
    ...options,
  };
}
