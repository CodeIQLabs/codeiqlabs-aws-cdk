/**
 * Workload Base Stage for CodeIQLabs Infrastructure
 *
 * This module provides the enhanced base stage class specifically designed for
 * workload account infrastructure with automatic configuration transformation
 * and standardized patterns.
 */

import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { ManifestConfigAdapter } from '@codeiqlabs/aws-utils';
import type { WorkloadAppConfig, WorkloadBaseStackConfig } from '@codeiqlabs/aws-utils';
import { BaseStage } from './base-stage';
import type {
  EnhancedWorkloadStageProps,
  StackCreationOptions,
  StackCreationResult,
  WorkloadStackConstructor,
} from './stage-types';

/**
 * Enhanced base stage for workload account infrastructure
 *
 * This class provides:
 * - Automatic configuration transformation from WorkloadAppConfig to WorkloadBaseStackConfig
 * - Environment-specific configuration handling
 * - Standardized stack creation with workload-specific patterns
 * - Built-in validation for workload account requirements
 * - Consistent naming and tagging for workload resources
 *
 * @example
 * ```typescript
 * export class ApplicationStage extends WorkloadBaseStage {
 *   constructor(scope: Construct, id: string, props: EnhancedWorkloadStageProps) {
 *     super(scope, id, props);
 *
 *     // Create stacks using the enhanced utilities
 *     const vpcResult = this.createStack(VpcStack, 'Vpc');
 *
 *     const appResult = this.createStack(ApplicationStack, 'Application', {
 *       dependencies: [vpcResult.stack],
 *       additionalProps: {
 *         vpcId: vpcResult.stack.vpcId,
 *         enableMonitoring: this.isProductionEnvironment()
 *       }
 *     });
 *   }
 * }
 * ```
 */
export abstract class WorkloadBaseStage extends BaseStage {
  /** The original workload manifest configuration */
  protected readonly manifest: WorkloadAppConfig;

  /** The environment name for this stage */
  protected readonly envName: string;

  /** The environment configuration for this stage */
  protected readonly environment: any;

  /** The transformed workload configuration for stacks */
  protected readonly workloadConfig: WorkloadBaseStackConfig;

  constructor(scope: Construct, id: string, props: EnhancedWorkloadStageProps) {
    // Validate environment exists
    const environment = props.cfg.environments[props.envName];
    if (!environment) {
      throw new Error(
        `Environment '${props.envName}' not found in workload manifest. ` +
          `Available environments: ${Object.keys(props.cfg.environments).join(', ')}`,
      );
    }

    // Transform manifest to base stack configuration
    const workloadConfig = ManifestConfigAdapter.toWorkloadConfig(props.cfg, props.envName);

    // Apply any configuration overrides
    const finalConfig = props.configOverrides
      ? { ...workloadConfig, ...props.configOverrides }
      : workloadConfig;

    super(scope, id, props, finalConfig);

    this.manifest = props.cfg;
    this.envName = props.envName;
    this.environment = environment;
    this.workloadConfig = finalConfig;

    // Validate workload-specific requirements
    this.validateWorkloadConfiguration();
  }

  /**
   * Create a workload stack with enhanced configuration and naming
   *
   * This method provides a simplified interface for creating workload stacks
   * with automatic configuration transformation and standardized patterns.
   *
   * @param stackClass - The workload stack constructor class
   * @param component - The component name for the stack
   * @param options - Stack creation options
   * @returns Stack creation result with metadata
   */
  protected createStack<T extends cdk.Stack>(
    stackClass: WorkloadStackConstructor<T>,
    component: string,
    options: StackCreationOptions = {},
  ): StackCreationResult<T> {
    return this.createWorkloadStack(stackClass, component, options);
  }

  /**
   * Validate workload-specific configuration requirements
   */
  protected validateWorkloadConfiguration(): void {
    super.validateConfiguration();

    // Validate workload account environment
    if (this.workloadConfig.environment === 'mgmt') {
      throw new Error('Workload stage cannot use management environment');
    }

    // Validate environment configuration
    if (!this.environment.accountId) {
      throw new Error(`Environment '${this.envName}' missing required accountId`);
    }

    if (!this.environment.region) {
      throw new Error(`Environment '${this.envName}' missing required region`);
    }
  }

  /**
   * Check if this is a production environment
   */
  protected isProductionEnvironment(): boolean {
    return this.envName === 'prod' || this.environment.environment === 'prod';
  }

  /**
   * Check if this is a non-production environment
   */
  protected isNonProductionEnvironment(): boolean {
    return !this.isProductionEnvironment();
  }

  /**
   * Check if this is a development environment
   */
  protected isDevelopmentEnvironment(): boolean {
    return this.envName === 'dev' || this.environment.environment === 'dev';
  }

  /**
   * Check if this is a staging environment
   */
  protected isStagingEnvironment(): boolean {
    return this.envName === 'staging' || this.environment.environment === 'staging';
  }

  /**
   * Get environment-specific configuration
   */
  protected getEnvironmentConfig() {
    return this.environment.config || {};
  }

  /**
   * Get monitoring configuration for this environment
   */
  protected getMonitoringConfig() {
    return this.getEnvironmentConfig().monitoring || {};
  }

  /**
   * Get scaling configuration for this environment
   */
  protected getScalingConfig() {
    return this.getEnvironmentConfig().scaling || {};
  }

  /**
   * Get security configuration for this environment
   */
  protected getSecurityConfig() {
    return this.getEnvironmentConfig().security || {};
  }

  /**
   * Get backup configuration for this environment
   */
  protected getBackupConfig() {
    return this.getEnvironmentConfig().backup || {};
  }

  /**
   * Get the original workload manifest
   */
  public getManifest(): WorkloadAppConfig {
    return this.manifest;
  }

  /**
   * Get the environment name
   */
  public getEnvironmentName(): string {
    return this.envName;
  }

  /**
   * Get the environment configuration
   */
  public getEnvironment() {
    return this.environment;
  }

  /**
   * Get the transformed workload configuration
   */
  public getWorkloadConfig(): WorkloadBaseStackConfig {
    return this.workloadConfig;
  }
}
