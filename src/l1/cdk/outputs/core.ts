/**
 * Core utilities for standardized CloudFormation outputs
 */

import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { ResourceNaming } from '@codeiqlabs/aws-utils/naming/convenience';

/**
 * Common output categories for consistent naming
 */
export type OutputCategory = 
  | 'account'
  | 'organization' 
  | 'identity-center'
  | 'domain'
  | 'certificate'
  | 'vpc'
  | 'database'
  | 'api'
  | 'frontend'
  | 'monitoring'
  | 'security';

/**
 * Props for creating a standard CloudFormation output
 */
export interface StandardOutputProps {
  /** The output key (will be used for export name generation) */
  key: string;
  /** The output value */
  value: string;
  /** Human-readable description */
  description: string;
  /** Optional category for grouping (affects construct ID) */
  category?: OutputCategory;
  /** Custom export name (overrides automatic generation) */
  exportName?: string;
  /** Custom construct ID (overrides automatic generation) */
  constructId?: string;
}

/**
 * Create a standardized CloudFormation output with consistent naming
 * 
 * This function creates a CloudFormation output with:
 * - Automatic export name generation using ResourceNaming
 * - Consistent construct ID generation
 * - Standardized description patterns
 * 
 * @param scope - CDK construct scope
 * @param naming - ResourceNaming instance for consistent naming
 * @param props - Output configuration
 * @returns The created CfnOutput
 */
export function createStandardOutput(
  scope: Construct,
  naming: ResourceNaming,
  props: StandardOutputProps
): cdk.CfnOutput {
  const {
    key,
    value,
    description,
    category,
    exportName,
    constructId,
  } = props;

  // Generate export name using ResourceNaming
  const finalExportName = exportName ?? naming.exportName(key);

  // Generate construct ID
  const finalConstructId = constructId ?? generateOutputConstructId(key, category);

  return new cdk.CfnOutput(scope, finalConstructId, {
    value,
    description,
    exportName: finalExportName,
  });
}

/**
 * Create multiple standardized outputs at once
 * 
 * @param scope - CDK construct scope
 * @param naming - ResourceNaming instance for consistent naming
 * @param outputs - Array of output configurations
 * @returns Array of created CfnOutputs
 */
export function createStandardOutputs(
  scope: Construct,
  naming: ResourceNaming,
  outputs: StandardOutputProps[]
): cdk.CfnOutput[] {
  return outputs.map(props => createStandardOutput(scope, naming, props));
}

/**
 * Create an account ID output with standardized naming
 * 
 * @param scope - CDK construct scope
 * @param naming - ResourceNaming instance
 * @param accountKey - Account key (e.g., 'budgettrack-np')
 * @param accountId - Account ID value
 * @param accountName - Human-readable account name
 * @returns The created CfnOutput
 */
export function createAccountIdOutput(
  scope: Construct,
  naming: ResourceNaming,
  accountKey: string,
  accountId: string,
  accountName: string
): cdk.CfnOutput {
  return createStandardOutput(scope, naming, {
    key: `${accountKey}-AccountId`,
    value: accountId,
    description: `Account ID for ${accountKey} (${accountName})`,
    category: 'account',
  });
}

/**
 * Create an Identity Center output with standardized naming
 * 
 * @param scope - CDK construct scope
 * @param naming - ResourceNaming instance
 * @param key - Output key (e.g., 'Instance-ARN', 'PermissionSet-Admin-Arn')
 * @param value - Output value
 * @param description - Human-readable description
 * @returns The created CfnOutput
 */
export function createIdentityCenterOutput(
  scope: Construct,
  naming: ResourceNaming,
  key: string,
  value: string,
  description: string
): cdk.CfnOutput {
  return createStandardOutput(scope, naming, {
    key: `SSO-${key}`,
    value,
    description,
    category: 'identity-center',
  });
}

/**
 * Create an organization output with standardized naming
 * 
 * @param scope - CDK construct scope
 * @param naming - ResourceNaming instance
 * @param key - Output key (e.g., 'Root-ID', 'Workloads-OU-ID')
 * @param value - Output value
 * @param description - Human-readable description
 * @returns The created CfnOutput
 */
export function createOrganizationOutput(
  scope: Construct,
  naming: ResourceNaming,
  key: string,
  value: string,
  description: string
): cdk.CfnOutput {
  return createStandardOutput(scope, naming, {
    key: `Org-${key}`,
    value,
    description,
    category: 'organization',
  });
}

/**
 * Generate a construct ID for an output
 * 
 * @param key - Output key
 * @param category - Optional category
 * @returns Sanitized construct ID
 */
function generateOutputConstructId(key: string, category?: OutputCategory): string {
  const sanitizedKey = key.replace(/[^a-zA-Z0-9]/g, '');
  const categoryPrefix = category ? `${category.replace(/[^a-zA-Z0-9]/g, '')}` : '';
  return `${categoryPrefix}${sanitizedKey}Output`;
}
