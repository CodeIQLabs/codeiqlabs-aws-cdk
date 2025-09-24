/**
 * S3 construct type definitions
 */

export * from './constructs';

/**
 * S3 bucket types
 */
export type S3BucketType = 'static-hosting' | 'data' | 'logs' | 'backup' | 'artifacts' | 'temp';

/**
 * S3 access patterns
 */
export type S3AccessPattern =
  | 'private'
  | 'public-read'
  | 'public-read-write'
  | 'authenticated-read';

/**
 * S3 storage classes
 */
export type S3StorageClass = 'STANDARD' | 'STANDARD_IA' | 'ONEZONE_IA' | 'GLACIER' | 'DEEP_ARCHIVE';
