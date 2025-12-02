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
 * Stacks are organized by component/domain:
 * - Base: Foundation classes for extending
 * - Organizations: AWS Organizations infrastructure
 * - Identity Center: AWS SSO infrastructure
 * - Domains: Domain management and delegation
 * - Workload: VPC, ECS, ALB, S3 for workload accounts
 */

// Base stack classes
export * from './base';

// Component-based stack implementations
export * from './organizations';
export * from './identity-center';
export * from './domains';
export * from './customization';

// Workload infrastructure stacks
export * from './workload';
