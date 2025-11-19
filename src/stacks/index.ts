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
 */

// Base stack classes
export * from './base';

// Component-based stack implementations
export * from './organizations';
export * from './identity-center';
export * from './domains';
