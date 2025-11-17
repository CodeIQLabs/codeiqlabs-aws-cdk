/**
 * Type definitions for Identity Center CDK constructs
 */

import type {
  ResourceNaming,
  PermissionSetConfig,
  SSOAssignmentConfig,
  UserConfig,
} from '@codeiqlabs/aws-utils';

/**
 * Props for the main IdentityCenterConstruct
 */
export interface IdentityCenterConstructProps {
  /** ResourceNaming instance for consistent naming */
  naming: ResourceNaming;
  /** AWS Identity Center instance ARN */
  instanceArn: string;
  /** Identity Store ID (required for user creation) */
  identityStoreId?: string;
  /** Users to create (optional) */
  users?: UserConfig[];
  /** Permission sets to create */
  permissionSets: PermissionSetConfig[];
  /** Assignments to create (optional) */
  assignments?: SSOAssignmentConfig[];
  /** Account IDs map for assignment resolution (optional) */
  accountIds?: Record<string, string>;
  /** Owner name or team for tagging */
  owner: string;
  /** Company/organization name for tagging */
  company: string;
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
  /** Owner name or team for tagging */
  owner: string;
  /** Company/organization name for tagging */
  company: string;
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
  /** User IDs map for principal resolution (optional) */
  userIds?: Record<string, string>;
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
  /** The identity store ID used (if provided) */
  identityStoreId?: string;
}
