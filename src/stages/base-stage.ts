/**
 * Abstract Base Stage for CodeIQLabs Infrastructure
 *
 * This module provides the abstract base stage class that contains common
 * functionality shared across all CodeIQLabs infrastructure stages.
 */

import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { ResourceNaming } from '@codeiqlabs/aws-utils';
import type { ManagementBaseStackConfig, WorkloadBaseStackConfig } from '@codeiqlabs/aws-utils';
import type {
  StackCreationOptions,
  StackCreationResult,
  ManagementStackConstructor,
  WorkloadStackConstructor,
} from './stage-types';

/**
 * Abstract base stage providing common functionality for all CodeIQLabs stages
 *
 * This class provides:
 * - Standardized stack creation utilities
 * - Automatic naming and tagging
 * - Configuration validation
 * - Dependency management
 *
 * @abstract
 */
export abstract class BaseStage extends cdk.Stage {
  /** Resource naming utility for consistent naming patterns */
  protected readonly naming: ResourceNaming;

  /** The base configuration for this stage */
  protected readonly baseConfig: ManagementBaseStackConfig | WorkloadBaseStackConfig;

  constructor(
    scope: Construct,
    id: string,
    props: cdk.StageProps,
    config: ManagementBaseStackConfig | WorkloadBaseStackConfig,
  ) {
    super(scope, id, props);

    this.baseConfig = config;
    this.naming = new ResourceNaming({
      project: config.project,
      environment: config.environment,
      region: config.region,
      accountId: config.accountId,
    });

    // Validate configuration
    this.validateConfiguration();
  }

  /**
   * Create a management stack with automatic configuration and naming
   *
   * @param stackClass - The stack constructor class
   * @param component - The component name for the stack
   * @param options - Stack creation options
   * @returns Stack creation result with metadata
   */
  protected createManagementStack<T extends cdk.Stack>(
    stackClass: ManagementStackConstructor<T>,
    component: string,
    options: StackCreationOptions = {},
  ): StackCreationResult<T> {
    if (!this.isManagementConfig(this.baseConfig)) {
      throw new Error(
        'Cannot create management stack: stage is not configured for management account',
      );
    }

    const stackName = options.stackName || this.naming.stackName(component);
    const env = options.env || {
      account: this.baseConfig.accountId,
      region: this.baseConfig.region,
    };

    const stack = new stackClass(this, stackName, {
      managementConfig: this.baseConfig,
      env,
      ...options.additionalProps,
    });

    // Apply dependencies if specified
    if (options.dependencies) {
      for (const dependency of options.dependencies) {
        stack.addDependency(dependency);
      }
    }

    return {
      stack,
      stackName,
      config: this.baseConfig,
    };
  }

  /**
   * Create a workload stack with automatic configuration and naming
   *
   * @param stackClass - The stack constructor class
   * @param component - The component name for the stack
   * @param options - Stack creation options
   * @returns Stack creation result with metadata
   */
  protected createWorkloadStack<T extends cdk.Stack>(
    stackClass: WorkloadStackConstructor<T>,
    component: string,
    options: StackCreationOptions = {},
  ): StackCreationResult<T> {
    if (!this.isWorkloadConfig(this.baseConfig)) {
      throw new Error('Cannot create workload stack: stage is not configured for workload account');
    }

    const stackName = options.stackName || this.naming.stackName(component);
    const env = options.env || {
      account: this.baseConfig.accountId,
      region: this.baseConfig.region,
    };

    const stack = new stackClass(this, stackName, {
      workloadConfig: this.baseConfig,
      env,
      ...options.additionalProps,
    });

    // Apply dependencies if specified
    if (options.dependencies) {
      for (const dependency of options.dependencies) {
        stack.addDependency(dependency);
      }
    }

    return {
      stack,
      stackName,
      config: this.baseConfig,
    };
  }

  /**
   * Validate the stage configuration
   * Subclasses can override this method to add specific validation
   */
  protected validateConfiguration(): void {
    if (!this.baseConfig.project) {
      throw new Error('Stage configuration missing required project name');
    }

    if (!this.baseConfig.environment) {
      throw new Error('Stage configuration missing required environment');
    }

    if (!this.baseConfig.region) {
      throw new Error('Stage configuration missing required region');
    }

    if (!this.baseConfig.accountId) {
      throw new Error('Stage configuration missing required account ID');
    }
  }

  /**
   * Type guard to check if config is for management account
   */
  private isManagementConfig(
    config: ManagementBaseStackConfig | WorkloadBaseStackConfig,
  ): config is ManagementBaseStackConfig {
    // Management configs typically have 'mgmt' environment
    return config.environment === 'mgmt';
  }

  /**
   * Type guard to check if config is for workload account
   */
  private isWorkloadConfig(
    config: ManagementBaseStackConfig | WorkloadBaseStackConfig,
  ): config is WorkloadBaseStackConfig {
    // Workload configs have non-mgmt environments
    return config.environment !== 'mgmt';
  }

  /**
   * Get the resource naming utility
   */
  public getNaming(): ResourceNaming {
    return this.naming;
  }

  /**
   * Get the base configuration
   */
  public getBaseConfig(): ManagementBaseStackConfig | WorkloadBaseStackConfig {
    return this.baseConfig;
  }
}
