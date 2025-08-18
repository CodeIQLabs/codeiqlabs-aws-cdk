/**
 * CDK Base Stack Classes for CodeIQLabs projects
 *
 * This module provides reusable base stack classes that eliminate repetitive code
 * and ensure consistent patterns across different types of AWS infrastructure.
 *
 * All base stacks follow these principles:
 * - Configuration comes from manifest files (no hardcoded values)
 * - Fail-fast validation with clear error messages
 * - Standardized naming using ResourceNaming
 * - Automatic application of standard tags
 * - Type-safe configuration interfaces
 *
 * Available base stacks:
 * - ManagementBaseStack: For AWS management account infrastructure
 * - WorkloadBaseStack: For application workload stacks
 *
 * Future base stacks may include:
 * - NetworkBaseStack: For VPC and networking infrastructure
 * - SecurityBaseStack: For security-related infrastructure
 * - MonitoringBaseStack: For observability infrastructure
 */

// Management account base stack
export * from './management-base';

// Workload account base stack
export * from './workload-base';

// Re-export types for convenience
export type { ManagementBaseStackConfig, ManagementBaseStackProps } from './management-base';

export type { WorkloadBaseStackConfig, WorkloadBaseStackProps } from './workload-base';
