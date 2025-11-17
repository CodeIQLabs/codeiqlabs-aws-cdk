/**
 * Standardized CDK Application Bootstrap
 *
 * This module provides the CdkApplication class that eliminates boilerplate
 * code in CDK application entry points by standardizing manifest loading,
 * validation, and stage creation patterns.
 *
 * Note: Most users should use createAutoApp() instead of using this class directly.
 */

import * as cdk from 'aws-cdk-lib';
import { initializeApp } from '@codeiqlabs/aws-utils';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

import { ApplicationInitError } from './types';
import type { CdkApplicationOptions, ApplicationInitResult } from './types';

/**
 * Standardized CDK Application with automatic manifest loading and validation
 *
 * This class provides the foundation for auto-detection by handling:
 * - Automatic manifest loading with type detection
 * - Type validation and error handling
 * - Stage creation utilities for auto-detection
 *
 * @example
 * ```typescript
 * // Recommended: Use auto-detection instead
 * import { createAutoApp } from '@codeiqlabs/aws-cdk';
 * createAutoApp().then(app => app.synth());
 *
 * // Advanced: Direct usage (rarely needed)
 * const app = await CdkApplication.create();
 * app.createManagementStage(OrganizationsStage);
 * app.synth();
 * ```
 */
export class CdkApplication extends cdk.App {
  /** The loaded and validated manifest configuration */
  public readonly config: UnifiedAppConfig;

  /** The file path that was loaded */
  public readonly manifestPath: string;

  /**
   * Initialize a new CDK application with automatic manifest loading
   *
   * @param options - Application initialization options
   */
  private constructor(
    config: UnifiedAppConfig,
    manifestPath: string,
    options: CdkApplicationOptions = {},
  ) {
    // Initialize the CDK App first
    super(options.appProps);

    // Store the loaded configuration
    this.config = config;
    this.manifestPath = manifestPath;

    // Note: Global aspects functionality removed - implement directly in CDK app if needed
  }

  /**
   * Create a new CDK application with automatic manifest loading
   *
   * @param options - Application initialization options
   * @returns Promise resolving to the initialized CdkApplication
   */
  static async create(options: CdkApplicationOptions = {}): Promise<CdkApplication> {
    // Load and validate the manifest
    const initResult = await CdkApplication.initializeManifest(options);

    return new CdkApplication(initResult.config, initResult.filePath, options);
  }

  /**
   * Initialize and validate the manifest configuration
   *
   * @param options - Application options
   * @returns Promise resolving to the initialization result
   * @throws ApplicationInitError if initialization fails
   */
  private static async initializeManifest(
    options: CdkApplicationOptions,
  ): Promise<ApplicationInitResult> {
    try {
      // Determine manifest path
      const manifestPath = options.manifestPath || 'src/manifest.yaml';

      // Load manifest (unified schema only)
      const result = await initializeApp(manifestPath, {
        verbose: true,
      });

      if (!result.success) {
        throw new ApplicationInitError(
          result.error || 'Failed to load manifest',
          undefined,
          manifestPath,
        );
      }

      return {
        config: result.data! as UnifiedAppConfig,
        filePath: manifestPath,
      };
    } catch (error) {
      if (error instanceof ApplicationInitError) {
        // Re-throw ApplicationInitError as-is
        throw error;
      }

      // Wrap other errors
      throw new ApplicationInitError(
        `Application initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
        options.manifestPath,
      );
    }
  }
}
