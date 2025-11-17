/**
 * Factory Function Option Types and Defaults
 *
 * This module defines option types and default values for factory functions,
 * providing centralized configuration management for application creation.
 */

import type * as cdk from 'aws-cdk-lib';

/**
 * Options for factory functions
 */
export interface FactoryOptions {
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
