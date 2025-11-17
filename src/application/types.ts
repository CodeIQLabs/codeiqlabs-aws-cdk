/**
 * Application-specific types for CDK Application Bootstrap
 *
 * This module defines types used by the CdkApplication class and related
 * application bootstrap utilities.
 */

import type * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Unified manifest configuration (replaces legacy ManifestType)
 */
export type ManifestConfig = UnifiedAppConfig;

/**
 * Options for CdkApplication initialization
 */
export interface CdkApplicationOptions {
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
  additionalProps?: Record<string, unknown>;

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
 * Application initialization result
 */
export interface ApplicationInitResult {
  /**
   * The loaded manifest configuration
   */
  config: UnifiedAppConfig;

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
