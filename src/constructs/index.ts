/**
 * CDK Construct Classes for CodeIQLabs projects
 *
 * This module provides reusable CDK constructs that eliminate repetitive code
 * and ensure consistent patterns across all CodeIQLabs infrastructure projects.
 *
 * All constructs follow these principles:
 * - Standardized naming and tagging patterns
 * - Consistent SSM parameter and CloudFormation output creation
 * - Type-safe configuration with validation
 * - Reusable patterns for common AWS resources
 */

// AWS Organizations constructs
export * from './organizations';

// AWS Identity Center (SSO) constructs
export * from './identity-center';

// Deployment permissions constructs
export * from './deployment-permissions';
