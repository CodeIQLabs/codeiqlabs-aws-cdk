/**
 * CDK Stack Classes for CodeIQLabs projects
 *
 * This module provides reusable stack classes that eliminate repetitive code
 * and ensure consistent patterns across different types of AWS infrastructure.
 *
 * All stacks follow these principles:
 * - Configuration comes from manifest files (no hardcoded values)
 * - Fail-fast validation with clear error messages
 * - Standardized naming using ResourceNaming
 * - Automatic application of standard tags
 * - Type-safe configuration interfaces
 *
 * Available stack types:
 * - Base stacks: Foundation classes for extending
 * - Management stacks: Pre-built management account infrastructure
 * - Workload stacks: Pre-built workload account infrastructure
 */

// Base stack classes
export * from './base';

// Management account stack implementations
export * from './management';

// Workload account stack implementations
export * from './workload';
