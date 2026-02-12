/**
 * CDK Shared Stack Classes for CodeIQLabs projects
 *
 * This module provides shared, pattern-agnostic stack classes.
 * These stacks would be the same regardless of deployment architecture.
 *
 * Shared stacks:
 * - Base: Foundation classes for extending
 * - Organizations: AWS Organizations infrastructure
 * - Identity Center: AWS SSO infrastructure
 * - Customization: GitHub OIDC for CI/CD authentication
 *
 * Pattern-specific stacks (edge, workload) are in src/patterns/
 */

// Base stack classes
export * from './base';

// Shared component stack implementations
export * from './organizations';
export * from './identity-center';
export * from './customization';
