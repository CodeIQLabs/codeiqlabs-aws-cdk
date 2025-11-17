/**
 * CDK Application Bootstrap Utilities - Unified Component-Based Architecture
 *
 * This module provides standardized CDK application bootstrap utilities with
 * a unified component-based architecture.
 *
 * Key exports:
 * - Application Factory: Single entry point for creating CDK applications
 * - Component Orchestration: Component-based stack creation
 * - Configuration Management: Centralized configuration and validation
 * - Core Application: CDK application class with manifest loading
 *
 * @example
 * ```typescript
 * import { createApp } from '@codeiqlabs/aws-cdk';
 * createApp().then(app => app.synth());
 * ```
 */

// Main application class
export { CdkApplication } from './cdk-application';

// Unified application factory
export { createApp } from './factories';

// Component-based orchestration
export { ComponentOrchestrator } from './orchestration';
export type { BaseOrchestrator } from './orchestration';
export { OrchestrationError } from './orchestration';

// Configuration management
export type { FactoryOptions, AppConfig } from './config';
export { ConfigValidationError } from './config';

// Core type definitions
export type {
  // Core types
  ManifestConfig,
  CdkApplicationOptions,
  ApplicationInitResult,

  // Stage creation types
  StageConstructor,
  StageCreationOptions,

  // Stage props interfaces
  BaseStageProps,
} from './types';

// Re-export the error class
export { ApplicationInitError } from './types';
