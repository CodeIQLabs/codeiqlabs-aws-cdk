/**
 * @codeiqlabs/aws-cdk - AWS CDK wrapper utilities for CodeIQLabs projects
 *
 * This package provides Level 1 and Level 2 abstractions for AWS CDK constructs
 * that eliminate repetitive code and ensure consistent patterns across all
 * CodeIQLabs infrastructure projects.
 *
 * @example
 * ```typescript
 * // Import everything
 * import { ... } from '@codeiqlabs/aws-cdk';
 *
 * // Import only L1 abstractions
 * import { ... } from '@codeiqlabs/aws-cdk/l1';
 *
 * // Import only L2 abstractions (when available)
 * import { ... } from '@codeiqlabs/aws-cdk/l2';
 * ```
 */

// Re-export everything from L1 for convenience
export * from './l1';

// Re-export common utilities
export * from './common';

// L2 exports will be added here when L2 abstractions are created
// export * from './l2';
