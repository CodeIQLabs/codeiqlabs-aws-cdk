/**
 * CloudFront distribution constructs
 */

import {
  Distribution,
  OriginAccessIdentity,
  ViewerProtocolPolicy,
  CachePolicy,
  ICachePolicy,
  OriginRequestPolicy,
  ResponseHeadersPolicy,
  IResponseHeadersPolicy,
  SecurityPolicyProtocol,
  HttpVersion,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { NamedConstruct, type NamedConstructProps } from '../../core/constructs/named-construct';
import type { Construct } from 'constructs';

/**
 * Properties for CloudFront distribution constructs
 */
export interface CloudFrontDistributionConstructProps extends NamedConstructProps {
  /**
   * Type of distribution (spa, website, api, etc.)
   */
  readonly distributionType: string;

  /**
   * Origin S3 bucket
   */
  readonly originBucket: IBucket;

  /**
   * Domain names for the distribution
   */
  readonly domainNames?: string[];

  /**
   * SSL certificate for custom domains
   */
  readonly certificate?: ICertificate;

  /**
   * Whether to enable logging
   */
  readonly enableLogging?: boolean;

  /**
   * Default root object
   */
  readonly defaultRootObject?: string;

  /**
   * Error page configurations for SPAs
   */
  readonly enableSpaErrorHandling?: boolean;
}

/**
 * CloudFront distribution construct with built-in naming, tagging, and best practices
 */
export class CloudFrontDistributionConstruct extends NamedConstruct {
  public readonly distribution: Distribution;
  public readonly originAccessIdentity: OriginAccessIdentity;
  public readonly distributionType: string;

  constructor(scope: Construct, id: string, props: CloudFrontDistributionConstructProps) {
    super(scope, id, {
      ...props,
      resourceType: 'cloudfront-distribution',
    });

    this.distributionType = props.distributionType;

    // Create Origin Access Identity for S3
    this.originAccessIdentity = new OriginAccessIdentity(this, this.generateLogicalId('oai'), {
      comment: this.generateDescription(
        'origin-access-identity',
        `Access to ${props.originBucket.bucketName}`,
      ),
    });

    // Create CloudFront distribution
    this.distribution = new Distribution(this, this.generateLogicalId('distribution'), {
      comment: this.generateDescription(
        'cloudfront-distribution',
        `${props.distributionType} distribution`,
      ),

      // Default behavior
      defaultBehavior: {
        origin: new S3Origin(props.originBucket, {
          originAccessIdentity: this.originAccessIdentity,
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: this.getCachePolicy(props.distributionType),
        originRequestPolicy: OriginRequestPolicy.CORS_S3_ORIGIN,
        responseHeadersPolicy: this.getSecurityHeadersPolicy(),
      },

      // Domain configuration
      domainNames: props.domainNames,
      certificate: props.certificate,

      // Default root object
      defaultRootObject: props.defaultRootObject || 'index.html',

      // Error responses for SPAs
      errorResponses: props.enableSpaErrorHandling ? this.getSpaErrorResponses() : undefined,

      // Security and performance
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: HttpVersion.HTTP2,

      // Enable IPv6
      enableIpv6: true,

      // Logging
      enableLogging: props.enableLogging ?? this.isProduction(),
    });

    // Grant OAI access to S3 bucket
    props.originBucket.grantRead(this.originAccessIdentity);

    // Apply CloudFront-specific tags
    this.applyCloudFrontSpecificTags();
  }

  /**
   * Get cache policy based on distribution type
   */
  private getCachePolicy(distributionType: string): ICachePolicy {
    switch (distributionType) {
      case 'spa':
      case 'website':
        return CachePolicy.CACHING_OPTIMIZED;
      case 'api':
        return CachePolicy.CACHING_DISABLED;
      default:
        return CachePolicy.CACHING_OPTIMIZED;
    }
  }

  /**
   * Get security headers policy
   */
  private getSecurityHeadersPolicy(): IResponseHeadersPolicy {
    return ResponseHeadersPolicy.SECURITY_HEADERS;
  }

  /**
   * Get SPA error responses for client-side routing
   */
  private getSpaErrorResponses() {
    return [
      {
        httpStatus: 403,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
      },
      {
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
      },
    ];
  }

  /**
   * Apply CloudFront-specific tags
   */
  private applyCloudFrontSpecificTags(): void {
    const cloudFrontTags = {
      Service: 'CloudFront',
      DistributionType: this.distributionType,
      HttpVersion: 'HTTP2',
      SecurityPolicy: 'TLS_V1_2_2021',
    };

    Object.entries(cloudFrontTags).forEach(([key, value]) => {
      this.distribution.node.addMetadata(key, value);
    });
  }

  /**
   * Get the component name for tagging
   */
  protected getComponentName(): string {
    return `cloudfront-${this.distributionType}`;
  }

  /**
   * Get distribution domain name
   */
  public getDistributionDomainName(): string {
    return this.distribution.distributionDomainName;
  }

  /**
   * Get distribution ID
   */
  public getDistributionId(): string {
    return this.distribution.distributionId;
  }
}
