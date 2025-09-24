/**
 * CDK Application Bootstrap Utilities - Modular Architecture
 *
 * This module provides standardized CDK application bootstrap utilities with
 * a modular architecture that separates concerns across focused modules.
 *
 * Key exports:
 * - Application Factories: Main entry points for creating CDK applications
 * - Stage Registries: Type-safe stage registration and lookup
 * - Stage Orchestration: Coordination between detection and stage creation
 * - Configuration Management: Centralized configuration and validation
 * - Core Application: CDK application class with manifest loading
 *
 * @example
 * ```typescript
 * // Main entry points (recommended)
 * import { createAutoApp } from '@codeiqlabs/aws-cdk';
 * createAutoApp().then(app => app.synth());
 *
 * // Direct module access (advanced)
 * import { createAutoApp } from '@codeiqlabs/aws-cdk/application/factories';
 * import { ManagementStageRegistry } from '@codeiqlabs/aws-cdk/application/registry';
 * ```
 */

// Main application class
export { CdkApplication } from './cdk-application';

// Application factories (main entry points)
export { createAutoApp, createManagementApp, createWorkloadApp } from './factories';

// Stage registries
export { ManagementStageRegistry, WorkloadStageRegistry } from './registry';
export type {
  ManagementStageConstructor,
  WorkloadStageConstructor,
  ManagementStageRegistryInterface,
  WorkloadStageRegistryInterface,
} from './registry';

// Stage orchestration
export { ManagementOrchestrator, WorkloadOrchestrator } from './orchestration';
export type { BaseOrchestrator } from './orchestration';
export { OrchestrationError } from './orchestration';

// Configuration management
export type { FactoryOptions, AppConfig } from './config';
export { ConfigValidationError, FactoryError } from './config';

// Core type definitions
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
