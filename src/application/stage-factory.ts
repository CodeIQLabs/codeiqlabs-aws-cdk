/**
 * Stage Factory Utilities for CDK Applications
 *
 * This module provides utilities for creating CDK stages with standardized
 * configuration and naming patterns.
 */

import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { generateStageName } from '@codeiqlabs/aws-utils';
import type { ManagementAppConfig, WorkloadAppConfig } from '@codeiqlabs/aws-utils';
import type {
  StageConstructor,
  StageCreationOptions,
  ManagementStageOptions,
  WorkloadStageOptions,
  ManagementStageProps,
  WorkloadStageProps,
} from './types';

/**
 * Factory class for creating CDK stages with standardized patterns
 */
export class StageFactory {
  /**
   * Create a stage with automatic configuration and naming
   *
   * @param scope - The parent construct
   * @param stageClass - The stage constructor class
   * @param config - The manifest configuration
   * @param options - Stage creation options
   * @returns The created stage instance
   */
  static createStage<T extends cdk.Stage>(
    scope: Construct,
    stageClass: StageConstructor<T>,
    config: ManagementAppConfig | WorkloadAppConfig,
    options: StageCreationOptions = {},
  ): T {
    // Generate standardized stage name
    const stageName =
      options.stageName || generateStageName(config.project, config.management.environment);

    // Determine environment configuration
    const env =
      options.env || this.getEnvironmentFromConfig(config, options.additionalProps?.envName);

    // Create stage props
    const stageProps = {
      cfg: config,
      env,
      ...options.additionalProps,
    };

    return new stageClass(scope, stageName, stageProps);
  }

  /**
   * Create a management stage with management-specific configuration
   *
   * @param scope - The parent construct
   * @param stageClass - The management stage constructor class
   * @param config - The management manifest configuration
   * @param options - Management stage creation options
   * @returns The created management stage instance
   */
  static createManagementStage<T extends cdk.Stage>(
    scope: Construct,
    stageClass: StageConstructor<T>,
    config: ManagementAppConfig,
    options: ManagementStageOptions = {},
  ): T {
    // Apply management-specific overrides
    const finalConfig = options.managementOverrides
      ? { ...config, ...options.managementOverrides }
      : config;

    // Generate management stage name
    const stageName =
      options.stageName ||
      generateStageName(finalConfig.project, finalConfig.management.environment);

    // Management environment configuration
    const env = options.env || {
      account: finalConfig.management.accountId,
      region: finalConfig.management.region,
    };

    // Create management stage props
    const stageProps: ManagementStageProps = {
      cfg: finalConfig,
      env,
      ...options.additionalProps,
    };

    return new stageClass(scope, stageName, stageProps);
  }

  /**
   * Create a workload stage with workload-specific configuration
   *
   * @param scope - The parent construct
   * @param stageClass - The workload stage constructor class
   * @param config - The workload manifest configuration
   * @param envName - The environment name (e.g., 'np', 'prod')
   * @param options - Workload stage creation options
   * @returns The created workload stage instance
   */
  static createWorkloadStage<T extends cdk.Stage>(
    scope: Construct,
    stageClass: StageConstructor<T>,
    config: WorkloadAppConfig,
    envName: string,
    options: WorkloadStageOptions = {},
  ): T {
    // Validate environment exists
    const environment = config.environments[envName];
    if (!environment) {
      throw new Error(
        `Environment '${envName}' not found in workload manifest. Available environments: ${Object.keys(
          config.environments,
        ).join(', ')}`,
      );
    }

    // Apply workload-specific overrides
    const finalConfig = options.workloadOverrides
      ? { ...config, ...options.workloadOverrides }
      : config;

    // Generate workload stage name
    const stageName = options.stageName || generateStageName(finalConfig.project, envName);

    // Workload environment configuration
    const env = options.env || {
      account: environment.accountId,
      region: environment.region,
    };

    // Create workload stage props
    const stageProps: WorkloadStageProps = {
      cfg: finalConfig,
      envName,
      env,
      ...options.additionalProps,
    };

    return new stageClass(scope, stageName, stageProps);
  }

  /**
   * Extract environment configuration from manifest config
   *
   * @param config - The manifest configuration
   * @param envName - Optional environment name for workload configs
   * @returns CDK environment configuration
   */
  private static getEnvironmentFromConfig(
    config: ManagementAppConfig | WorkloadAppConfig,
    envName?: string,
  ): cdk.Environment {
    switch (config.type) {
      case 'management':
        return {
          account: config.management.accountId,
          region: config.management.region,
        };

      case 'workload': {
        if (!envName) {
          throw new Error('Environment name is required for workload manifest configurations');
        }
        const environment = config.environments[envName];
        if (!environment) {
          throw new Error(`Environment '${envName}' not found in workload manifest`);
        }
        return {
          account: environment.accountId,
          region: environment.region,
        };
      }

      default:
        throw new Error(`Unsupported manifest type: ${(config as any).type}`);
    }
  }
}
