/**
 * Core SSM parameter creation utilities
 */

import type { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { SecretValue } from 'aws-cdk-lib';
import type {
  NamingInput,
  SSMStringParamOpts,
  SSMBatchParamOpts
} from './types';
import {
  resolveNaming,
  sanitizeForConstructId
} from './types';

/**
 * Build SSM parameter name following CodeIQLabs naming conventions
 * Pattern: /{project}/{environment}/{category}/{name}
 * Example: /CodeIQLabs/Management/accounts/budgettrack-np-id
 */
export function buildSsmParameterName(naming: NamingInput, category: string, name: string): string {
  const cfg = resolveNaming(naming);
  if (!category?.trim()) throw new Error('category is required');
  if (!name?.trim()) throw new Error('name is required');
  return `/${cfg.project}/${cfg.environment}/${category}/${name}`;
}

/**
 * Create a STRING parameter with standardized naming
 */
export function createStringParameter(
  scope: Construct,
  naming: NamingInput,
  opts: SSMStringParamOpts
): ssm.StringParameter {
  const { category, name, value, description, idPrefix = 'SSMParam', tier = ssm.ParameterTier.STANDARD } = opts;

  if (value == null) throw new Error(`value is required for ${category}/${name}`);

  const parameterName = buildSsmParameterName(naming, category, name);
  const constructId = `${idPrefix}${sanitizeForConstructId(category)}${sanitizeForConstructId(name)}`;

  return new ssm.StringParameter(scope, constructId, {
    parameterName,
    stringValue: value,
    description,
    tier
  });
}

/**
 * Create multiple SSM parameters from a record of values
 */
export function createStringParameters(
  scope: Construct,
  naming: NamingInput,
  opts: SSMBatchParamOpts
): ssm.StringParameter[] {
  const { category, parameters, descriptionPrefix, idPrefix, tier } = opts;

  return Object.entries(parameters).map(([name, value]) =>
    createStringParameter(scope, naming, {
      category,
      name,
      value,
      description: `${descriptionPrefix} ${name}`,
      idPrefix,
      tier
    })
  );
}

/**
 * Read a secure string value from SSM Parameter Store
 */
export function readSecureStringValue(parameterName: string, version?: string) {
  return SecretValue.ssmSecure(parameterName, version);
}

/**
 * Generate construct ID for SSM parameter
 */
export function generateSsmConstructId(category: string, name: string, prefix = 'SSMParam'): string {
  return `${prefix}${sanitizeForConstructId(category)}${sanitizeForConstructId(name)}`;
}
