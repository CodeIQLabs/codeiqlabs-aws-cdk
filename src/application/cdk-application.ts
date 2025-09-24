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
import type { ManagementAppConfig, WorkloadAppConfig } from '@codeiqlabs/aws-utils';

import { ApplicationInitError } from './types';
import type {
  CdkApplicationOptions,
  ManifestType,
  ApplicationInitResult,
  StageConstructor,
  ManagementStageOptions,
  WorkloadStageOptions,
} from './types';

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
  public readonly config: ManagementAppConfig | WorkloadAppConfig;

  /** The detected manifest type */
  public readonly manifestType: ManifestType;

  /** The file path that was loaded */
  public readonly manifestPath: string;

  /**
   * Initialize a new CDK application with automatic manifest loading
   *
   * @param options - Application initialization options
   */
  private constructor(
    config: ManagementAppConfig | WorkloadAppConfig,
    manifestType: ManifestType,
    manifestPath: string,
    options: CdkApplicationOptions = {},
  ) {
    // Initialize the CDK App first
    super(options.appProps);

    // Store the loaded configuration
    this.config = config;
    this.manifestType = manifestType;
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

    return new CdkApplication(initResult.config, initResult.type, initResult.filePath, options);
  }

  /**
   * Create a management stage with management-specific configuration
   *
   * @param stageClass - The management stage constructor class
   * @param options - Management stage creation options
   * @returns The created management stage instance
   */
  createManagementStage<T extends cdk.Stage>(
    stageClass: StageConstructor<T>,
    options: ManagementStageOptions = {},
  ): T {
    if (this.manifestType !== 'management') {
      throw new ApplicationInitError(
        `Cannot create management stage: expected management manifest but got ${this.manifestType}`,
        undefined,
        this.manifestPath,
      );
    }

    // Simple direct management stage creation
    const managementConfig = (this.config as ManagementAppConfig).management;
    const stageName = options.stageName || `${this.config.project}-${managementConfig.environment}`;
    return new stageClass(this, stageName, {
      manifest: this.config as ManagementAppConfig,
      env: options.env || {
        account: managementConfig.accountId,
        region: managementConfig.region,
      },
    });
  }

  /**
   * Create a workload stage with workload-specific configuration
   *
   * @param envName - The environment name (e.g., 'np', 'prod')
   * @param stageClass - The workload stage constructor class
   * @param options - Workload stage creation options
   * @returns The created workload stage instance
   */
  createWorkloadStage<T extends cdk.Stage>(
    envName: string,
    stageClass: StageConstructor<T>,
    options: WorkloadStageOptions = {},
  ): T {
    if (this.manifestType !== 'workload') {
      throw new ApplicationInitError(
        `Cannot create workload stage: expected workload manifest but got ${this.manifestType}`,
        undefined,
        this.manifestPath,
      );
    }

    // Simple direct workload stage creation
    const stageName = options.stageName || `${this.config.project}-${envName}`;
    const workloadConfig = this.config as WorkloadAppConfig;
    const envConfig = workloadConfig.environments[envName];

    if (!envConfig) {
      throw new ApplicationInitError(
        `Environment '${envName}' not found in workload manifest`,
        undefined,
        this.manifestPath,
      );
    }

    return new stageClass(this, stageName, {
      manifest: workloadConfig,
      environment: envName,
      config: envConfig.config,
      env: options.env || {
        account: envConfig.accountId,
        region: envConfig.region || workloadConfig.management.region,
      },
    });
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

      // Load manifest with auto-detection
      const result = await initializeApp(manifestPath, {
        expectedType: options.expectedType,
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
        config: result.data! as ManagementAppConfig | WorkloadAppConfig,
        type: result.type! as ManifestType,
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
