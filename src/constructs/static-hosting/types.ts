/**
 * Type definitions for Static Hosting CDK constructs
 *
 * This module provides TypeScript interfaces and types for static hosting
 * infrastructure components including S3 buckets, CloudFront distributions,
 * and domain management.
 */

import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import type * as route53 from 'aws-cdk-lib/aws-route53';
import type * as acm from 'aws-cdk-lib/aws-certificatemanager';
import type { ResourceNaming } from '@codeiqlabs/aws-utils';

/**
 * Configuration for S3 static hosting bucket
 */
export interface StaticHostingBucketConfig {
  /** Whether to enable versioning on the S3 bucket */
  versioning?: boolean;
  /** Whether to enable server access logging */
  accessLogging?: boolean;
  /** Lifecycle rules for old versions */
  lifecycleRules?: s3.LifecycleRule[];
  /** Custom bucket name (optional - uses naming convention if not provided) */
  bucketName?: string;
}

/**
 * Configuration for CloudFront distribution
 */
export interface StaticHostingDistributionConfig {
  /** Price class for CloudFront distribution */
  priceClass?: cloudfront.PriceClass;
  /** Custom error responses for SPA routing */
  errorResponses?: cloudfront.ErrorResponse[];
  /** Whether to enable compression */
  compress?: boolean;
  /** Default root object */
  defaultRootObject?: string;
  /** Custom cache behaviors */
  additionalBehaviors?: Record<string, cloudfront.BehaviorOptions>;
}

/**
 * Configuration for domain and SSL certificate
 */
export interface StaticHostingDomainConfig {
  /** Domain name for the static site */
  domainName: string;
  /** Parent domain for delegation */
  parentDomain?: string;
  /** Parent hosted zone ID for delegation */
  parentHostedZoneId?: string;
  /** Alternative domain names */
  alternativeDomainNames?: string[];
  /** Certificate validation method */
  certificateValidation?: acm.ValidationMethod;
}

/**
 * Props for StaticHostingBucket construct
 */
export interface StaticHostingBucketProps {
  /** Resource naming utility */
  naming: ResourceNaming;
  /** Environment (prod, nprd, etc.) */
  environment: string;
  /** Bucket configuration */
  config?: StaticHostingBucketConfig;
  /** Owner for tagging */
  owner?: string;
  /** Company for tagging */
  company?: string;
  /** Custom tags */
  customTags?: Record<string, string>;
  /** Whether to create SSM parameters */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs */
  createOutputs?: boolean;
}

/**
 * Props for StaticHostingDistribution construct
 */
export interface StaticHostingDistributionProps {
  /** Resource naming utility */
  naming: ResourceNaming;
  /** Environment (prod, nprd, etc.) */
  environment: string;
  /** S3 bucket for origin */
  bucket: s3.Bucket;
  /** Origin access identity */
  originAccessIdentity: cloudfront.OriginAccessIdentity;
  /** SSL certificate */
  certificate?: acm.Certificate;
  /** Domain configuration */
  domainConfig?: StaticHostingDomainConfig;
  /** Distribution configuration */
  config?: StaticHostingDistributionConfig;
  /** Owner for tagging */
  owner?: string;
  /** Company for tagging */
  company?: string;
  /** Custom tags */
  customTags?: Record<string, string>;
  /** Whether to create SSM parameters */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs */
  createOutputs?: boolean;
}

/**
 * Props for StaticHostingDomain construct
 */
export interface StaticHostingDomainProps {
  /** Resource naming utility */
  naming: ResourceNaming;
  /** Environment (prod, nprd, etc.) */
  environment: string;
  /** Domain configuration */
  domainConfig: StaticHostingDomainConfig;
  /** Owner for tagging */
  owner?: string;
  /** Company for tagging */
  company?: string;
  /** Custom tags */
  customTags?: Record<string, string>;
  /** Whether to create SSM parameters */
  createSsmParameters?: boolean;
  /** Whether to create CloudFormation outputs */
  createOutputs?: boolean;
}

/**
 * Result from StaticHostingBucket construct
 */
export interface StaticHostingBucketResult {
  /** The created S3 bucket */
  bucket: s3.Bucket;
  /** Origin access identity for CloudFront */
  originAccessIdentity: cloudfront.OriginAccessIdentity;
}

/**
 * Result from StaticHostingDistribution construct
 */
export interface StaticHostingDistributionResult {
  /** The created CloudFront distribution */
  distribution: cloudfront.Distribution;
  /** Distribution domain name */
  distributionDomainName: string;
  /** Distribution ID */
  distributionId: string;
}

/**
 * Result from StaticHostingDomain construct
 */
export interface StaticHostingDomainResult {
  /** The created hosted zone */
  hostedZone: route53.HostedZone;
  /** The created SSL certificate */
  certificate: acm.Certificate;
  /** Hosted zone ID */
  hostedZoneId: string;
  /** Certificate ARN */
  certificateArn: string;
}
