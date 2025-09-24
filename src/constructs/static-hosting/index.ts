/**
 * Static Hosting CDK Constructs for CodeIQLabs projects
 *
 * This module provides reusable CDK constructs for static hosting infrastructure
 * that eliminate repetitive code and ensure consistent patterns across all
 * CodeIQLabs static website projects.
 *
 * Features:
 * - S3 bucket optimized for static hosting with CloudFront OAI
 * - CloudFront distribution with SPA-friendly error responses
 * - Route53 hosted zone and ACM certificate management
 * - Cross-account domain delegation support
 * - Standardized naming and tagging patterns
 * - Environment-specific configurations
 * - Automatic SSM parameter and CloudFormation output creation
 *
 * @example
 * ```typescript
 * import { StaticHostingBucketConstruct } from '@codeiqlabs/aws-cdk/constructs/static-hosting';
 *
 * const bucketResult = new StaticHostingBucketConstruct(this, 'StaticHosting', {
 *   naming: this.naming,
 *   environment: 'prod',
 *   config: {
 *     versioning: true,
 *     compress: true,
 *   },
 * });
 * ```
 */

// Export construct classes
export { StaticHostingBucketConstruct } from './constructs';
export { StaticHostingDistributionConstruct } from './constructs';
export { StaticHostingDomainConstruct } from './constructs';

// Export type definitions
export type {
  // Configuration types
  StaticHostingBucketConfig,
  StaticHostingDistributionConfig,
  StaticHostingDomainConfig,

  // Props interfaces
  StaticHostingBucketProps,
  StaticHostingDistributionProps,
  StaticHostingDomainProps,

  // Result interfaces
  StaticHostingBucketResult,
  StaticHostingDistributionResult,
  StaticHostingDomainResult,
} from './types';
