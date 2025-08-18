// CDK-specific utilities (requires aws-cdk-lib)
export * from './cdk';

// Re-export core tagging utilities from @codeiqlabs/aws-utils
export {
  generateStandardTags,
  convertToCfnTags,
  ResourceTagging,
  validateEnvironment,
  ENV_VALUES,
} from '@codeiqlabs/aws-utils';

// Re-export types from @codeiqlabs/aws-utils
export type {
  EnvironmentTag,
  ExtraTags,
  TaggingOptions,
  StandardTags,
  CodeIQLabsStandardTags,
  Environment,
} from '@codeiqlabs/aws-utils';
