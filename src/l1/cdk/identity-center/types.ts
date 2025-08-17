/**
 * Type definitions for Identity Center CDK constructs
 */

import type { ResourceNaming } from '@codeiqlabs/aws-utils/naming/convenience';
import type { PermissionSetConfig, SSOAssignmentConfig } from '@codeiqlabs/aws-utils/config';

/**
 * Props for the main IdentityCenterConstruct
 */
export interface IdentityCenterConstructProps {
  /** ResourceNaming instance for consistent naming */
  naming: ResourceNaming;
  /** AWS Identity Center instance ARN */
  instanceArn: string;
  /** Permission sets to create */
  permissionSets: PermissionSetConfig[];
  /** Assignments to create (optional) */
  assignments?: SSOAssignmentConfig[];
  /** Account IDs map for assignment resolution (optional) */
  accountIds?: Record<string, string>;
  /** Whether to create SSM parameters (default: true) */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs (default: true) */
  createOutputs?: boolean;
}

/**
 * Props for individual PermissionSetConstruct
 */
export interface PermissionSetConstructProps {
  /** ResourceNaming instance for consistent naming */
  naming: ResourceNaming;
  /** AWS Identity Center instance ARN */
  instanceArn: string;
  /** Permission set configuration */
  config: PermissionSetConfig;
  /** Whether to create SSM parameters (default: true) */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs (default: true) */
  createOutputs?: boolean;
}

/**
 * Props for AssignmentConstruct
 */
export interface AssignmentConstructProps {
  /** ResourceNaming instance for consistent naming */
  naming: ResourceNaming;
  /** AWS Identity Center instance ARN */
  instanceArn: string;
  /** Assignment configuration */
  config: SSOAssignmentConfig;
  /** Account IDs map for target resolution */
  accountIds: Record<string, string>;
  /** Permission set ARN to assign */
  permissionSetArn: string;
}

/**
 * Result from creating permission sets
 */
export interface PermissionSetResult {
  /** The created permission set resource */
  permissionSet: any; // CfnPermissionSet from aws-cdk-lib/aws-sso
  /** The permission set ARN */
  arn: string;
  /** The permission set name */
  name: string;
}

/**
 * Result from creating the Identity Center construct
 */
export interface IdentityCenterResult {
  /** Map of permission set names to their results */
  permissionSets: Record<string, PermissionSetResult>;
  /** List of created assignments */
  assignments: any[]; // CfnAssignment[] from aws-cdk-lib/aws-sso
  /** The instance ARN used */
  instanceArn: string;
}
