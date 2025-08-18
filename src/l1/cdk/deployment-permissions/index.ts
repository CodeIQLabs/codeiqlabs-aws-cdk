/**
 * AWS Deployment Permissions CDK Constructs for CodeIQLabs projects
 *
 * This module provides reusable CDK constructs for deployment permission resources
 * that eliminate repetitive code and ensure consistent patterns across all
 * CodeIQLabs projects.
 *
 * Features:
 * - Standardized cross-account role creation with automatic tagging
 * - GitHub OIDC provider and role management for CI/CD
 * - Consistent SSM parameter and CloudFormation output creation
 * - Type-safe configuration with validation
 * - Automatic naming using ResourceNaming conventions
 * - Comprehensive IAM permissions for CDK deployments
 *
 * @example
 * ```typescript
 * import { DeploymentPermissionsConstruct } from '@codeiqlabs/aws-cdk/deployment-permissions';
 *
 * const deploymentPermissions = new DeploymentPermissionsConstruct(this, 'DeploymentPermissions', {
 *   naming: this.naming,
 *   config: config.deploymentPermissions,
 *   project: projectConfig,
 *   environment: environmentConfig,
 *   managementAccount: managementConfig,
 * });
 * ```
 */

// Re-export all constructs and utilities
export * from './constructs';
export * from './types';

// Re-export types for convenience
export type {
  DeploymentPermissionsConstructProps,
  CrossAccountRoleConstructProps,
  GitHubOidcProviderConstructProps,
  GitHubOidcRoleConstructProps,
  DeploymentPermissionsResult,
  CrossAccountRoleResult,
  GitHubOidcProviderResult,
  GitHubOidcRoleResult,
} from './types';
