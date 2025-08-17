/**
 * Level 1 CDK Abstractions for CodeIQLabs projects
 *
 * These are thin wrappers around AWS CDK constructs that provide:
 * - Standardized naming and tagging patterns
 * - Consistent SSM parameter and CloudFormation output creation
 * - Type-safe configuration with validation
 * - Reusable patterns for common AWS resources
 */

// Re-export everything from the CDK module structure
export * from './cdk';
