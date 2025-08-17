/**
 * Type definitions for Organizations CDK constructs
 */

import type { ResourceNaming } from '@codeiqlabs/aws-utils/naming/convenience';
import type { OrganizationalUnitConfig, ConfigMode, AccountConfig } from '@codeiqlabs/aws-utils/config';

/**
 * Props for the main OrganizationConstruct
 */
export interface OrganizationConstructProps {
  /** ResourceNaming instance for consistent naming */
  naming: ResourceNaming;
  /** Organization mode: create new or adopt existing */
  mode: ConfigMode;
  /** Organization root ID */
  rootId: string;
  /** Organizational units to create/adopt */
  organizationalUnits: OrganizationalUnitConfig[];
  /** AWS Organizations feature set (default: 'ALL') */
  featureSet?: 'ALL' | 'CONSOLIDATED_BILLING';
  /** Whether to create SSM parameters (default: true) */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs (default: true) */
  createOutputs?: boolean;
}

/**
 * Props for OrganizationalUnitConstruct
 */
export interface OrganizationalUnitConstructProps {
  /** ResourceNaming instance for consistent naming */
  naming: ResourceNaming;
  /** Organization mode: create new or adopt existing */
  mode: ConfigMode;
  /** Parent ID (root or OU) */
  parentId: string;
  /** OU configuration */
  config: OrganizationalUnitConfig;
  /** Whether to create SSM parameters (default: true) */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs (default: true) */
  createOutputs?: boolean;
}

/**
 * Props for AccountConstruct
 */
export interface AccountConstructProps {
  /** ResourceNaming instance for consistent naming */
  naming: ResourceNaming;
  /** Organization mode: create new or adopt existing */
  mode: ConfigMode;
  /** Parent OU ID */
  parentId: string;
  /** Account configuration */
  config: AccountConfig;
  /** Whether to create SSM parameters (default: true) */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs (default: true) */
  createOutputs?: boolean;
}

/**
 * Result from creating an account
 */
export interface AccountResult {
  /** The account ID */
  accountId: string;
  /** The account key */
  key: string;
  /** The account name */
  name: string;
  /** The created account resource (if in create mode) */
  account?: any; // CfnAccount from aws-cdk-lib/aws-organizations
}

/**
 * Result from creating an organizational unit
 */
export interface OrganizationalUnitResult {
  /** The OU ID */
  ouId: string;
  /** The OU key */
  key: string;
  /** The OU name */
  name: string;
  /** Map of account keys to their results */
  accounts: Record<string, AccountResult>;
  /** The created OU resource (if in create mode) */
  organizationalUnit?: any; // CfnOrganizationalUnit from aws-cdk-lib/aws-organizations
}

/**
 * Result from creating the Organization construct
 */
export interface OrganizationResult {
  /** The organization (if created) */
  organization?: any; // CfnOrganization from aws-cdk-lib/aws-organizations
  /** Map of OU keys to their results */
  organizationalUnits: Record<string, OrganizationalUnitResult>;
  /** Flattened map of all account keys to account IDs */
  accountIds: Record<string, string>;
  /** The root ID used */
  rootId: string;
  /** The mode used */
  mode: ConfigMode;
}
