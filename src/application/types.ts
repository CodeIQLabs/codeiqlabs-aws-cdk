/**
 * Application-specific types for CDK Application Bootstrap
 *
 * This module defines types used by the CdkApplication class and related
 * application bootstrap utilities.
 */

import type * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { ManagementAppConfig, WorkloadAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Supported manifest types
 */
export type ManifestType = 'management' | 'workload';

/**
 * Union type for all supported manifest configurations
 */
export type ManifestConfig = ManagementAppConfig | WorkloadAppConfig;

/**
 * Options for CdkApplication initialization
 */
export interface CdkApplicationOptions {
  /**
   * Expected manifest type for validation
   * If provided, the application will validate that the loaded manifest matches this type
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
 * Options for stage creation
 */
export interface StageCreationOptions {
  /**
   * Additional properties to pass to the stage constructor
   */
  additionalProps?: Record<string, any>;

  /**
   * Override the default stage name generation
   */
  stageName?: string;

  /**
   * Override the default environment configuration
   */
  env?: cdk.Environment;
}

/**
 * Options for management stage creation
 */
export interface ManagementStageOptions extends StageCreationOptions {
  /**
   * Management-specific configuration overrides
   */
  managementOverrides?: Partial<ManagementAppConfig>;
}

/**
 * Options for workload stage creation
 */
export interface WorkloadStageOptions extends StageCreationOptions {
  /**
   * Workload-specific configuration overrides
   */
  workloadOverrides?: Partial<WorkloadAppConfig>;
}

/**
 * Constructor type for CDK stages
 */
export type StageConstructor<T extends cdk.Stage> = new (
  scope: Construct,
  id: string,
  props: any,
) => T;

/**
 * Props interface that all stages should implement
 */
export interface BaseStageProps extends cdk.StageProps {
  /**
   * The loaded and validated manifest configuration
   */
  cfg: ManifestConfig;
}

/**
 * Management stage props interface
 */
export interface ManagementStageProps extends BaseStageProps {
  cfg: ManagementAppConfig;
}

/**
 * Workload stage props interface
 */
export interface WorkloadStageProps extends BaseStageProps {
  cfg: WorkloadAppConfig;
  envName: string;
}

/**
 * Application initialization result
 */
export interface ApplicationInitResult {
  /**
   * The loaded manifest configuration
   */
  config: ManagementAppConfig | WorkloadAppConfig;

  /**
   * The detected manifest type
   */
  type: ManifestType;

  /**
   * The file path that was loaded
   */
  filePath: string;
}

/**
 * Error thrown when application initialization fails
 */
export class ApplicationInitError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly filePath?: string,
  ) {
    super(message);
    this.name = 'ApplicationInitError';
  }
}
