/**
 * Standardized CloudFormation Output utilities for CodeIQLabs projects
 *
 * This module provides utilities for creating consistent CloudFormation outputs
 * with standardized naming patterns across all CodeIQLabs projects.
 *
 * Features:
 * - Automatic export name generation using ResourceNaming
 * - Consistent description patterns
 * - Type-safe output creation
 * - Reduced boilerplate code
 *
 * @example
 * ```typescript
 * import { createStandardOutput } from '@codeiqlabs/aws-utils/cdk/outputs';
 *
 * createStandardOutput(this, this.naming, {
 *   key: 'SSO-Instance-ARN',
 *   value: instanceArn,
 *   description: 'AWS SSO Identity Center Instance ARN',
 * });
 * ```
 */

// Re-export all utilities
export * from './core';

// Re-export types for convenience
export type { StandardOutputProps, OutputCategory } from './core';
