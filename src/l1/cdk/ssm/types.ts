/**
 * Type definitions for SSM parameter utilities
 */

import type * as ssm from 'aws-cdk-lib/aws-ssm';

// Import centralized naming types and utilities from aws-utils
export type {
  NamingConfig,
  NamingProvider,
  NamingInput,
  BaseParamOpts,
  StringParamOpts,
  BatchParamOpts
} from '@codeiqlabs/aws-utils/naming/types';

export { resolveNaming, sanitizeForConstructId } from '@codeiqlabs/aws-utils/naming/types';

// Override the BaseParamOpts to use the proper SSM ParameterTier type
export interface SSMBaseParamOpts {
  /** Logical group under /{project}/{environment}/{category}/{name} */
  category: string;
  /** Leaf name (path-safe; we won't escape it) */
  name: string;
  /** Human description */
  description?: string;
  /** Construct id prefix (defaults to "SSMParam") */
  idPrefix?: string;
  /** SSM tier (default STANDARD) */
  tier?: ssm.ParameterTier;
}

/** Options for creating string parameters with proper SSM types */
export interface SSMStringParamOpts extends SSMBaseParamOpts {
  /** Parameter value */
  value: string;
}

/** Options for creating multiple parameters with proper SSM types */
export interface SSMBatchParamOpts extends Omit<SSMBaseParamOpts, 'name'> {
  /** Record of parameter names to values */
  parameters: Record<string, string>;
  /** Prefix for parameter descriptions */
  descriptionPrefix: string;
}
