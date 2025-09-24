/**
 * CloudFront construct type definitions
 */

export * from './constructs';

/**
 * CloudFront distribution types
 */
export type CloudFrontDistributionType = 'spa' | 'website' | 'api' | 'streaming' | 'download';

/**
 * CloudFront cache behaviors
 */
export type CloudFrontCacheBehavior = 'optimized' | 'disabled' | 'custom';

/**
 * CloudFront viewer protocols
 */
export type CloudFrontViewerProtocol = 'allow-all' | 'redirect-to-https' | 'https-only';
