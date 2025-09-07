/**
 * Types for Declarative Stack Registration Pattern
 *
 * This module defines the types used for the declarative stack registration
 * system that allows stages to define their stacks declaratively rather
 * than imperatively.
 */

import * as cdk from 'aws-cdk-lib';
import type { ManagementAppConfig, WorkloadAppConfig } from '@codeiqlabs/aws-utils';
import type { ManagementStackConstructor, WorkloadStackConstructor } from './stage-types';

/**
 * Management-specific stack registration
 */
export interface ManagementStackRegistration<T extends cdk.Stack> {
  /** The stack constructor class */
  stackClass: ManagementStackConstructor<T>;

  /** The component name for the stack (used for naming) */
  component: string;

  /** Function to determine if this stack should be created based on manifest */
  enabled: (manifest: ManagementAppConfig) => boolean;

  /** Optional list of component names this stack depends on */
  dependencies?: string[];

  /** Function to generate additional props for the stack constructor */
  additionalProps?: (manifest: ManagementAppConfig, dependencies: Record<string, cdk.Stack>) => any;
}

/**
 * Workload-specific stack registration
 */
export interface WorkloadStackRegistration<T extends cdk.Stack> {
  /** The stack constructor class */
  stackClass: WorkloadStackConstructor<T>;

  /** The component name for the stack (used for naming) */
  component: string;

  /** Function to determine if this stack should be created based on manifest */
  enabled: (manifest: WorkloadAppConfig) => boolean;

  /** Optional list of component names this stack depends on */
  dependencies?: string[];

  /** Function to generate additional props for the stack constructor */
  additionalProps?: (manifest: WorkloadAppConfig, dependencies: Record<string, cdk.Stack>) => any;
}

/**
 * Result of creating a stack through the declarative system
 */
export interface DeclarativeStackResult<T extends cdk.Stack> {
  /** The created stack instance */
  stack: T;

  /** The component name used */
  component: string;

  /** The final stack name */
  stackName: string;

  /** Whether the stack was actually created (vs skipped due to disabled) */
  created: boolean;
}
