/**
 * Stage-specific types for enhanced base stage classes
 *
 * This module defines types used by the enhanced base stage classes that provide
 * automatic configuration transformation and standardized patterns.
 */

import type * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type {
  ManagementAppConfig,
  WorkloadAppConfig,
  ManagementBaseStackConfig,
  WorkloadBaseStackConfig,
} from '@codeiqlabs/aws-utils';

/**
 * Enhanced props for management stages with automatic configuration transformation
 */
export interface EnhancedManagementStageProps extends cdk.StageProps {
  /**
   * The management manifest configuration
   */
  cfg: ManagementAppConfig;

  /**
   * Optional configuration overrides
   */
  configOverrides?: Partial<ManagementBaseStackConfig>;
}

/**
 * Enhanced props for workload stages with automatic configuration transformation
 */
export interface EnhancedWorkloadStageProps extends cdk.StageProps {
  /**
   * The workload manifest configuration
   */
  cfg: WorkloadAppConfig;

  /**
   * The environment name for this stage
   */
  envName: string;

  /**
   * Optional configuration overrides
   */
  configOverrides?: Partial<WorkloadBaseStackConfig>;
}

/**
 * Constructor type for management base stacks
 */
export type ManagementStackConstructor<T extends cdk.Stack> = new (
  scope: Construct,
  id: string,
  props: any,
) => T;

/**
 * Constructor type for workload base stacks
 */
export type WorkloadStackConstructor<T extends cdk.Stack> = new (
  scope: Construct,
  id: string,
  props: any,
) => T;

/**
 * Options for creating stacks within stages
 */
export interface StackCreationOptions {
  /**
   * Additional properties to pass to the stack constructor
   */
  additionalProps?: Record<string, any>;

  /**
   * Override the default stack naming
   */
  stackName?: string;

  /**
   * Override the default environment configuration
   */
  env?: cdk.Environment;

  /**
   * Stack dependencies
   */
  dependencies?: cdk.Stack[];
}

/**
 * Result of stack creation with metadata
 */
export interface StackCreationResult<T extends cdk.Stack> {
  /**
   * The created stack instance
   */
  stack: T;

  /**
   * The generated stack name
   */
  stackName: string;

  /**
   * The configuration used for the stack
   */
  config: ManagementBaseStackConfig | WorkloadBaseStackConfig;
}
