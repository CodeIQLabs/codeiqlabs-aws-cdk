/**
 * Domain-specific convenience functions for SSM parameters
 *
 * These functions provide simplified APIs for common parameter patterns
 * used across CodeIQLabs projects.
 */

import type { Construct } from 'constructs';
import type * as ssm from 'aws-cdk-lib/aws-ssm';
import type { NamingInput } from './types';
import { createStringParameter } from './core';

/**
 * Convenience function for creating account ID SSM parameters
 *
 * Creates a parameter under the 'accounts' category with standardized naming
 * Pattern: /{project}/{environment}/accounts/{accountKey}-id
 */
export function createAccountIdParameter(
  scope: Construct,
  naming: NamingInput,
  accountKey: string,
  accountId: string,
  accountName: string,
): ssm.StringParameter {
  return createStringParameter(scope, naming, {
    category: 'accounts',
    name: `${accountKey}-id`,
    value: accountId,
    description: `Account ID for ${accountKey} (${accountName})`,
  });
}

/**
 * Convenience function for creating organization-related SSM parameters
 *
 * Creates a parameter under the 'organization' category
 * Pattern: /{project}/{environment}/organization/{parameterName}
 */
export function createOrganizationParameter(
  scope: Construct,
  naming: NamingInput,
  parameterName: string,
  value: string,
  description: string,
): ssm.StringParameter {
  return createStringParameter(scope, naming, {
    category: 'organization',
    name: parameterName,
    value,
    description,
  });
}

/**
 * Convenience function for creating Identity Center SSM parameters
 *
 * Creates a parameter under the 'identity-center' category
 * Pattern: /{project}/{environment}/identity-center/{parameterName}
 */
export function createIdentityCenterParameter(
  scope: Construct,
  naming: NamingInput,
  parameterName: string,
  value: string,
  description: string,
): ssm.StringParameter {
  return createStringParameter(scope, naming, {
    category: 'identity-center',
    name: parameterName,
    value,
    description,
  });
}

/**
 * Convenience function for creating deployment-related SSM parameters
 *
 * Creates a parameter under the 'deployment' category
 * Pattern: /{project}/{environment}/deployment/{parameterName}
 */
export function createDeploymentParameter(
  scope: Construct,
  naming: NamingInput,
  parameterName: string,
  value: string,
  description: string,
): ssm.StringParameter {
  return createStringParameter(scope, naming, {
    category: 'deployment',
    name: parameterName,
    value,
    description,
  });
}

/**
 * Convenience function for creating domain-related SSM parameters
 *
 * Creates a parameter under the 'domains' category
 * Pattern: /{project}/{environment}/domains/{parameterName}
 */
export function createDomainParameter(
  scope: Construct,
  naming: NamingInput,
  parameterName: string,
  value: string,
  description: string,
): ssm.StringParameter {
  return createStringParameter(scope, naming, {
    category: 'domains',
    name: parameterName,
    value,
    description,
  });
}

/**
 * Convenience function for creating VPC-related SSM parameters
 *
 * Creates a parameter under the 'vpc' category
 * Pattern: /{project}/{environment}/vpc/{parameterName}
 */
export function createVpcParameter(
  scope: Construct,
  naming: NamingInput,
  parameterName: string,
  value: string,
  description: string,
): ssm.StringParameter {
  return createStringParameter(scope, naming, {
    category: 'vpc',
    name: parameterName,
    value,
    description,
  });
}

/**
 * Convenience function for creating database-related SSM parameters
 *
 * Creates a parameter under the 'database' category
 * Pattern: /{project}/{environment}/database/{parameterName}
 */
export function createDatabaseParameter(
  scope: Construct,
  naming: NamingInput,
  parameterName: string,
  value: string,
  description: string,
): ssm.StringParameter {
  return createStringParameter(scope, naming, {
    category: 'database',
    name: parameterName,
    value,
    description,
  });
}
