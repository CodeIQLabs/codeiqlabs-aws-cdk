/**
 * AWS Organizations CDK Constructs for CodeIQLabs projects
 * 
 * This module provides reusable CDK constructs for AWS Organizations resources
 * that eliminate repetitive code and ensure consistent patterns across all
 * management account repositories.
 * 
 * Features:
 * - Standardized organization, OU, and account creation
 * - Support for both "create" and "adopt" modes
 * - Automatic SSM parameter and CloudFormation output creation
 * - Consistent naming and tagging patterns
 * - Type-safe configuration with validation
 * 
 * @example
 * ```typescript
 * import { OrganizationConstruct } from '@codeiqlabs/aws-utils/cdk/organizations';
 * 
 * const org = new OrganizationConstruct(this, 'Organization', {
 *   naming: this.naming,
 *   mode: config.organization.mode,
 *   rootId: props.orgRootId,
 *   organizationalUnits: config.organization.organizationalUnits,
 *   featureSet: config.organization.featureSet,
 * });
 * ```
 */

// Re-export all constructs and utilities
export * from './constructs';
export * from './types';

// Re-export types for convenience
export type {
  OrganizationConstructProps,
  OrganizationalUnitConstructProps,
  AccountConstructProps,
  OrganizationResult,
} from './types';
