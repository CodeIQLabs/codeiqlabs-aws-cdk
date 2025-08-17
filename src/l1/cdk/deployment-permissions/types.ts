/**
 * Type definitions for Deployment Permissions CDK constructs
 */

import type { ResourceNaming } from '@codeiqlabs/aws-utils/naming/convenience';
import type { 
  DeploymentPermissions,
  Project,
  ProjectEnvironment,
  CrossAccountRole,
  GitHubOidc,
} from '@codeiqlabs/aws-utils/config';
import * as iam from 'aws-cdk-lib/aws-iam';

/**
 * Management account configuration for deployment permissions
 */
export interface ManagementAccount {
  accountId: string;
  region: string;
  environment: string;
}

/**
 * Props for the main DeploymentPermissionsConstruct
 */
export interface DeploymentPermissionsConstructProps {
  /** ResourceNaming instance for consistent naming */
  naming: ResourceNaming;
  /** Deployment permissions configuration */
  config: DeploymentPermissions;
  /** Project configuration */
  project: Project;
  /** Environment configuration */
  environment: ProjectEnvironment;
  /** Management account configuration */
  managementAccount: ManagementAccount;
  /** Whether to create SSM parameters (default: true) */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs (default: true) */
  createOutputs?: boolean;
}

/**
 * Props for CrossAccountRoleConstruct
 */
export interface CrossAccountRoleConstructProps {
  /** ResourceNaming instance for consistent naming */
  naming: ResourceNaming;
  /** Cross-account role configuration */
  config: CrossAccountRole;
  /** Management account configuration */
  managementAccount: ManagementAccount;
  /** Whether to create SSM parameters (default: true) */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs (default: true) */
  createOutputs?: boolean;
}

/**
 * Props for GitHubOidcProviderConstruct
 */
export interface GitHubOidcProviderConstructProps {
  /** ResourceNaming instance for consistent naming */
  naming: ResourceNaming;
  /** Whether to create SSM parameters (default: true) */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs (default: true) */
  createOutputs?: boolean;
}

/**
 * Props for GitHubOidcRoleConstruct
 */
export interface GitHubOidcRoleConstructProps {
  /** ResourceNaming instance for consistent naming */
  naming: ResourceNaming;
  /** GitHub OIDC configuration */
  config: GitHubOidc;
  /** Environment configuration */
  environment: ProjectEnvironment;
  /** OIDC provider to use for the role */
  oidcProvider: iam.OpenIdConnectProvider;
  /** Whether to create SSM parameters (default: true) */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs (default: true) */
  createOutputs?: boolean;
}

/**
 * Result from creating cross-account role
 */
export interface CrossAccountRoleResult {
  /** The created IAM role */
  role: iam.Role;
  /** The role ARN */
  arn: string;
  /** The role name */
  name: string;
}

/**
 * Result from creating GitHub OIDC provider
 */
export interface GitHubOidcProviderResult {
  /** The created OIDC provider */
  provider: iam.OpenIdConnectProvider;
  /** The provider ARN */
  arn: string;
}

/**
 * Result from creating GitHub OIDC role
 */
export interface GitHubOidcRoleResult {
  /** The created IAM role */
  role: iam.Role;
  /** The role ARN */
  arn: string;
  /** The role name */
  name: string;
}

/**
 * Complete result from deployment permissions construct
 */
export interface DeploymentPermissionsResult {
  /** Cross-account role result (if created) */
  crossAccountRole?: CrossAccountRoleResult;
  /** GitHub OIDC provider result (if created) */
  githubOidcProvider?: GitHubOidcProviderResult;
  /** GitHub OIDC role result (if created) */
  githubOidcRole?: GitHubOidcRoleResult;
}
