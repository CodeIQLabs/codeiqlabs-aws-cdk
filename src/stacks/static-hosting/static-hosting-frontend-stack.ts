/**
 * Static Hosting Frontend Stack
 *
 * This stack creates the frontend infrastructure for static hosting:
 * - S3 bucket for static content storage
 * - CloudFront distribution for global content delivery
 * - Route53 A record pointing to CloudFront
 * - Origin Access Identity for secure S3 access
 *
 * This stack follows the single-construct pattern where it wraps
 * StaticHostingBucketConstruct and StaticHostingDistributionConstruct
 * with minimal business logic.
 */

import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base/base-stack';
import {
  StaticHostingBucketConstruct,
  StaticHostingDistributionConstruct,
} from '../../constructs/static-hosting/constructs';
import type {
  StaticHostingBucketConfig,
  StaticHostingDistributionConfig,
  StaticHostingBucketResult,
  StaticHostingDistributionResult,
} from '../../constructs/static-hosting/types';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Props for StaticHostingFrontendStack
 */
export interface StaticHostingFrontendStackProps extends BaseStackProps {
  /** The complete manifest configuration */
  config: UnifiedAppConfig;
  /** Environment name (nprd, prod, etc.) */
  environment: string;
  /** Environment-specific configuration */
  envConfig: any;
  /** Hosted zone for DNS records */
  hostedZone: route53.IHostedZone;
  /** SSL certificate for HTTPS */
  certificate: acm.Certificate;
}

/**
 * Reusable stack for static hosting frontend infrastructure
 *
 * This stack creates frontend infrastructure including:
 * - S3 bucket for static content with proper security
 * - CloudFront distribution for global content delivery
 * - Route53 A record pointing to CloudFront distribution
 * - Origin Access Identity for secure CloudFront to S3 access
 *
 * The stack follows the single-construct pattern where it wraps
 * multiple constructs with minimal business logic.
 *
 * @example
 * ```typescript
 * const frontendStack = new StaticHostingFrontendStack(stage, 'Frontend', {
 *   stackConfig: {
 *     project: 'CodeIQLabs',
 *     environment: 'prod',
 *     region: 'us-east-1',
 *     accountId: '719640820326',
 *     owner: 'CodeIQLabs',
 *     company: 'CodeIQLabs',
 *   },
 *   config: manifest,
 *   environment: 'prod',
 *   envConfig: manifest.environments.prod.config,
 *   hostedZone: domainStack.hostedZone,
 *   certificate: domainStack.certificate,
 * });
 * ```
 */
export class StaticHostingFrontendStack extends BaseStack {
  /** The bucket construct instance */
  public readonly bucketConstruct: StaticHostingBucketConstruct;

  /** The distribution construct instance */
  public readonly distributionConstruct: StaticHostingDistributionConstruct;

  /** The S3 bucket for static content */
  public readonly bucket: import('aws-cdk-lib/aws-s3').Bucket;

  /** The CloudFront distribution */
  public readonly distribution: import('aws-cdk-lib/aws-cloudfront').Distribution;

  constructor(scope: Construct, id: string, props: StaticHostingFrontendStackProps) {
    super(scope, id, 'Static-Hosting-Frontend', {
      ...props,
      stackConfig: {
        project: props.config.project,
        environment: props.environment,
        region: props.config.environments?.[props.environment]?.region || 'us-east-1',
        accountId: props.config.environments?.[props.environment]?.accountId || '',
        owner: props.config.company,
        company: props.config.company,
      },
    });

    const { config, environment, envConfig, hostedZone, certificate } = props;

    // Extract frontend and domain configuration
    const frontendConfig = envConfig.frontend || {};
    const domainConfig = envConfig.domain;

    if (!domainConfig || !domainConfig.name) {
      throw new Error(
        `Domain configuration is required for static hosting frontend. ` +
          `Please ensure environments.${environment}.config.domain.name is specified in your manifest.`,
      );
    }

    // Build bucket configuration
    const bucketConfig: StaticHostingBucketConfig = {
      versioning: frontendConfig.s3?.versioning || false,
      accessLogging: frontendConfig.s3?.accessLogging || false,
      bucketName: frontendConfig.s3?.bucketName,
    };

    // Create the S3 bucket construct
    this.bucketConstruct = new StaticHostingBucketConstruct(this, 'StaticHostingBucket', {
      naming: this.naming,
      environment,
      config: bucketConfig,
      owner: config.company,
      company: config.company,
      customTags: {
        Project: config.project,
        Environment: environment,
        Component: 'static-hosting-bucket',
      },
    });

    // Build distribution configuration
    const distributionConfig: StaticHostingDistributionConfig = {
      priceClass: frontendConfig.cloudfront?.priceClass,
      compress: frontendConfig.cloudfront?.compress !== false,
      defaultRootObject: frontendConfig.cloudfront?.defaultRootObject || 'index.html',
      errorResponses: frontendConfig.cloudfront?.errorResponses,
    };

    // Create the CloudFront distribution construct
    this.distributionConstruct = new StaticHostingDistributionConstruct(
      this,
      'StaticHostingDistribution',
      {
        naming: this.naming,
        environment,
        bucket: this.bucketConstruct.bucket,
        originAccessIdentity: this.bucketConstruct.originAccessIdentity,
        certificate,
        domainConfig: {
          domainName: domainConfig.name,
          alternativeDomainNames: domainConfig.alternativeDomainNames,
        },
        config: distributionConfig,
        owner: config.company,
        company: config.company,
        customTags: {
          Project: config.project,
          Environment: environment,
          Component: 'static-hosting-distribution',
        },
      },
    );

    // Create Route53 A record pointing to CloudFront
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: domainConfig.name,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distributionConstruct.distribution),
      ),
      comment: `A record for ${domainConfig.name} static hosting`,
    });

    // Expose the created resources
    this.bucket = this.bucketConstruct.bucket;
    this.distribution = this.distributionConstruct.distribution;
  }

  /**
   * Get the bucket result for use by other stacks
   */
  public getBucketResult(): StaticHostingBucketResult {
    return this.bucketConstruct.getResult();
  }

  /**
   * Get the distribution result for use by other stacks
   */
  public getDistributionResult(): StaticHostingDistributionResult {
    return this.distributionConstruct.getResult();
  }
}
