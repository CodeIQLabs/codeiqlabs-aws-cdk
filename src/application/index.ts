/**
 * CDK Application Bootstrap Utilities
 *
 * This module provides standardized CDK application bootstrap utilities that
 * eliminate repetitive code in bin/app.ts files across CodeIQLabs infrastructure
 * repositories.
 *
 * Key exports:
 * - CdkApplication: Main application class with automatic manifest loading
 * - StageFactory: Utilities for creating stages with standardized patterns
 * - Types: TypeScript interfaces and types for application bootstrap
 *
 * @example
 * ```typescript
 * import { CdkApplication } from '@codeiqlabs/aws-cdk/application';
 * import { ManagementStage } from '../src/stages/management.stage';
 *
 * const app = new CdkApplication({ expectedType: 'management' });
 * app.createStage(ManagementStage);
 * app.synth();
 * ```
 */

// Main application class
export { CdkApplication } from './cdk-application';

// Stage creation utilities
export { StageFactory } from './stage-factory';

// Type definitions
export type {
  // Core types
  ManifestConfig,
  CdkApplicationOptions,
  ApplicationInitResult,

  // Stage creation types
  StageConstructor,
  StageCreationOptions,
  ManagementStageOptions,
  WorkloadStageOptions,

  // Stage props interfaces
  BaseStageProps,
  ManagementStageProps,
  WorkloadStageProps,
} from './types';

// Re-export the error class
export { ApplicationInitError } from './types';
