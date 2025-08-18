/**
 * AWS Identity Center (SSO) CDK Constructs for CodeIQLabs projects
 *
 * This module provides reusable CDK constructs for AWS Identity Center resources
 * that eliminate repetitive code and ensure consistent patterns across all
 * management account repositories.
 *
 * Features:
 * - Standardized permission set creation with automatic tagging
 * - Automated assignment management with account resolution
 * - Consistent SSM parameter and CloudFormation output creation
 * - Type-safe configuration with validation
 * - Automatic naming using ResourceNaming conventions
 *
 * @example
 * ```typescript
 * import { IdentityCenterConstruct } from '@codeiqlabs/aws-utils/cdk/identity-center';
 *
 * const identityCenter = new IdentityCenterConstruct(this, 'IdentityCenter', {
 *   naming: this.naming,
 *   instanceArn: config.instanceArn,
 *   permissionSets: config.permissionSets,
 *   assignments: config.assignments,
 *   accountIds: props.accountIds,
 * });
 * ```
 */

// Re-export all constructs and utilities
export * from './constructs';
export * from './types';

// Re-export types for convenience
export type {
  IdentityCenterConstructProps,
  PermissionSetConstructProps,
  AssignmentConstructProps,
} from './types';
