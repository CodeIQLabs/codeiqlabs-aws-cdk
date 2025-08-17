/**
 * Type definitions for AWS resource tagging utilities
 * 
 * This module provides type definitions for standardized tagging across
 * CodeIQLabs AWS resources, ensuring consistent tag structure and validation.
 */

// ============================================================================
// Environment and Validation Types
// ============================================================================

// Import and re-export environment constants from centralized location
import type { Environment } from '@codeiqlabs/aws-utils/constants/environments';
export { ENV_VALUES, validateEnvironment } from '@codeiqlabs/aws-utils/constants/environments';
export type { Environment } from '@codeiqlabs/aws-utils/constants/environments';

// Alias for backward compatibility in tagging context
export type EnvironmentTag = Environment;

// ============================================================================
// Tag Structure Types
// ============================================================================

/**
 * Extra tags that can be applied to AWS resources
 * This is a flexible record type for custom tags beyond the standard ones
 */
export type ExtraTags = Record<string, string | undefined>;

/**
 * Options for configuring tag generation
 * Used by the generateStandardTags function and related utilities
 */
export interface TaggingOptions {
  /** Component name (required for standard tags) */
  component?: string;
  /** Application name (optional, defaults to project name) */
  application?: string;
  /** Owner email address */
  ownerEmail?: string;
  /** Cost center for billing/chargeback */
  costCenter?: string;
  /** Data classification level */
  dataClassification?: string;
  /** Repository name */
  repo?: string;
  /** Deployment tool (defaults to "CDK") */
  managedBy?: string;
  /** Additional custom tags */
  customTags?: ExtraTags;
}

/**
 * CodeIQLabs Standard Tag Structure
 *
 * Enforces consistent tagging across all AWS resources following CodeIQLabs standards:
 * - App: Short product/app name (e.g., BudgetTrack)
 * - Environment: np, prod, mgmt, or shared
 * - Component: System slice (e.g., Network, Data, Api, Frontend)
 * - Owner: Team or person (e.g., CodeIQLabs)
 * - OwnerEmail: Optional alias email (e.g., CodeIQLabs@gmail.com)
 * - CostCenter: For showback/chargeback (e.g., mgmt)
 * - ManagedBy: Deployment tool (e.g., CDK)
 * - Company: Organization name (e.g., CodeIQLabs)
 * - DataClassification: Public, Internal, Confidential
 * - Repo: Short repo name (e.g., codeiqlabs-management-aws)
 */
export interface CodeIQLabsStandardTags {
  App: string;                    // Short product/app name
  Environment: EnvironmentTag;    // np, prod, mgmt, or shared
  Component: string;              // System slice
  Owner: string;                  // Team or person
  OwnerEmail?: string;            // Optional alias email
  CostCenter?: string;            // For billing/chargeback
  ManagedBy: string;              // Deployment tool
  Company: string;                // Organization name
  DataClassification?: string;    // Public, Internal, Confidential
  Repo?: string;                  // Short repo name
}


