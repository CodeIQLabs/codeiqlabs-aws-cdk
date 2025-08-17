// Core functions
export * from './functions';

// Convenience classes and utilities
export * from './convenience';

// CDK-specific utilities (requires aws-cdk-lib)
export * from './cdk';

// Type definitions (explicit exports for better IDE support)
export type {
  EnvironmentTag,
  ExtraTags,
  TaggingOptions,
  CodeIQLabsStandardTags
} from './types';

// Environment utilities (re-exported from constants)
export { validateEnvironment, ENV_VALUES, type Environment } from '@codeiqlabs/aws-utils/constants/environments';
