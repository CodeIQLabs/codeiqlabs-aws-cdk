/**
 * CDK Constructs for Static Hosting Infrastructure
 *
 * This module provides high-level CDK constructs for creating static hosting
 * infrastructure with S3, CloudFront, and Route53 integration.
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { generateStandardTags } from '@codeiqlabs/aws-utils';
// Note: SSM parameter creation removed - implement directly if needed
import type {
  StaticHostingBucketProps,
  StaticHostingBucketResult,
  StaticHostingDistributionProps,
  StaticHostingDistributionResult,
  StaticHostingDomainProps,
  StaticHostingDomainResult,
} from './types';

/**
 * High-level construct for S3 static hosting bucket
 *
 * Creates an S3 bucket optimized for static website hosting with:
 * - Private access with CloudFront Origin Access Identity
 * - Proper security configurations
 * - Environment-specific lifecycle policies
 * - Standardized naming and tagging
 */
export class StaticHostingBucketConstruct extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly originAccessIdentity: cloudfront.OriginAccessIdentity;

  constructor(scope: Construct, id: string, props: StaticHostingBucketProps) {
    super(scope, id);

    const { naming, environment, config = {}, owner, company, customTags = {} } = props;

    // Create Origin Access Identity for CloudFront
    this.originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {
      comment: `OAI for ${naming.resourceName('static-hosting')}`,
    });

    // Create S3 bucket for static hosting
    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: config.bucketName || naming.resourceName('static-hosting-bucket'),
      accessControl: s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: config.versioning || false,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      lifecycleRules: config.lifecycleRules || [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
    });

    // Grant CloudFront OAI access to the bucket
    this.bucket.grantRead(this.originAccessIdentity);

    // Apply standard tags
    const tags = generateStandardTags(naming.getConfig(), {
      component: 'static-hosting',
      owner,
      company,
      customTags,
    });

    cdk.Tags.of(this.bucket).add('Component', 'static-hosting');
    cdk.Tags.of(this.bucket).add('Purpose', 'static-website-hosting');
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.bucket).add(key, value);
    });

    // Note: SSM parameter creation removed - implement directly if needed

    // Create CloudFormation outputs if requested
    if (props.createOutputs !== false) {
      new cdk.CfnOutput(this, 'BucketName', {
        value: this.bucket.bucketName,
        description: 'S3 bucket name for static hosting',
        exportName: naming.exportName('StaticHostingBucketName'),
      });

      new cdk.CfnOutput(this, 'BucketArn', {
        value: this.bucket.bucketArn,
        description: 'S3 bucket ARN for static hosting',
        exportName: naming.exportName('StaticHostingBucketArn'),
      });
    }
  }

  /**
   * Get the result summary for this bucket construct
   */
  public getResult(): StaticHostingBucketResult {
    return {
      bucket: this.bucket,
      originAccessIdentity: this.originAccessIdentity,
    };
  }
}

/**
 * High-level construct for CloudFront distribution for static hosting
 *
 * Creates a CloudFront distribution optimized for static websites with:
 * - S3 origin with Origin Access Identity
 * - SPA-friendly error responses
 * - SSL certificate integration
 * - Environment-specific configurations
 */
export class StaticHostingDistributionConstruct extends Construct {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StaticHostingDistributionProps) {
    super(scope, id);

    const {
      naming,
      environment,
      bucket,
      originAccessIdentity,
      certificate,
      domainConfig,
      config = {},
      owner,
      company,
      customTags = {},
    } = props;

    // Default error responses for SPA routing
    const defaultErrorResponses: cloudfront.ErrorResponse[] = [
      {
        httpStatus: 403,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: cdk.Duration.minutes(5),
      },
      {
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: cdk.Duration.minutes(5),
      },
    ];

    // Create CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: config.compress !== false,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      domainNames: domainConfig
        ? [domainConfig.domainName, ...(domainConfig.alternativeDomainNames || [])]
        : undefined,
      certificate,
      priceClass:
        config.priceClass ||
        (environment === 'prod'
          ? cloudfront.PriceClass.PRICE_CLASS_ALL
          : cloudfront.PriceClass.PRICE_CLASS_100),
      errorResponses: config.errorResponses || defaultErrorResponses,
      defaultRootObject: config.defaultRootObject || 'index.html',
      comment: `Static hosting distribution for ${naming.resourceName('static-hosting')}`,
      additionalBehaviors: config.additionalBehaviors,
    });

    // Apply standard tags
    const tags = generateStandardTags(naming.getConfig(), {
      component: 'static-hosting',
      owner,
      company,
      customTags,
    });

    cdk.Tags.of(this.distribution).add('Component', 'static-hosting');
    cdk.Tags.of(this.distribution).add('Purpose', 'content-delivery');
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.distribution).add(key, value);
    });

    // Note: SSM parameter creation removed - implement directly if needed

    // Create CloudFormation outputs if requested
    if (props.createOutputs !== false) {
      new cdk.CfnOutput(this, 'DistributionId', {
        value: this.distribution.distributionId,
        description: 'CloudFront distribution ID for static hosting',
        exportName: naming.exportName('StaticHostingDistributionId'),
      });

      new cdk.CfnOutput(this, 'DistributionDomain', {
        value: this.distribution.distributionDomainName,
        description: 'CloudFront distribution domain name for static hosting',
        exportName: naming.exportName('StaticHostingDistributionDomain'),
      });
    }
  }

  /**
   * Get the result summary for this distribution construct
   */
  public getResult(): StaticHostingDistributionResult {
    return {
      distribution: this.distribution,
      distributionDomainName: this.distribution.distributionDomainName,
      distributionId: this.distribution.distributionId,
    };
  }
}

/**
 * High-level construct for domain and SSL certificate for static hosting
 *
 * Creates Route53 hosted zone and ACM certificate for static hosting with:
 * - Subdomain hosted zone creation
 * - SSL certificate with DNS validation
 * - Cross-account delegation support
 * - Standardized naming and tagging
 */
export class StaticHostingDomainConstruct extends Construct {
  public readonly hostedZone: route53.HostedZone;
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: StaticHostingDomainProps) {
    super(scope, id);

    const { naming, domainConfig, owner, company, customTags = {} } = props;

    // Create hosted zone for the domain
    this.hostedZone = new route53.HostedZone(this, 'HostedZone', {
      zoneName: domainConfig.domainName,
      comment: `Hosted zone for ${domainConfig.domainName} static hosting`,
    });

    // Create SSL certificate with DNS validation
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: domainConfig.domainName,
      subjectAlternativeNames: domainConfig.alternativeDomainNames,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // Apply standard tags
    const tags = generateStandardTags(naming.getConfig(), {
      component: 'static-hosting',
      owner,
      company,
      customTags,
    });

    cdk.Tags.of(this.hostedZone).add('Component', 'static-hosting');
    cdk.Tags.of(this.hostedZone).add('Purpose', 'domain-management');
    cdk.Tags.of(this.certificate).add('Component', 'static-hosting');
    cdk.Tags.of(this.certificate).add('Purpose', 'ssl-certificate');

    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.hostedZone).add(key, value);
      cdk.Tags.of(this.certificate).add(key, value);
    });

    // Note: SSM parameter creation removed - implement directly if needed

    // Create CloudFormation outputs if requested
    if (props.createOutputs !== false) {
      new cdk.CfnOutput(this, 'HostedZoneId', {
        value: this.hostedZone.hostedZoneId,
        description: 'Route53 hosted zone ID for static hosting',
        exportName: naming.exportName('StaticHostingHostedZoneId'),
      });

      new cdk.CfnOutput(this, 'CertificateArn', {
        value: this.certificate.certificateArn,
        description: 'ACM certificate ARN for static hosting',
        exportName: naming.exportName('StaticHostingCertificateArn'),
      });

      new cdk.CfnOutput(this, 'NameServers', {
        value: cdk.Fn.join(',', this.hostedZone.hostedZoneNameServers || []),
        description: 'Name servers for static hosting domain delegation',
        exportName: naming.exportName('StaticHostingNameServers'),
      });
    }
  }

  /**
   * Get the result summary for this domain construct
   */
  public getResult(): StaticHostingDomainResult {
    return {
      hostedZone: this.hostedZone,
      certificate: this.certificate,
      hostedZoneId: this.hostedZone.hostedZoneId,
      certificateArn: this.certificate.certificateArn,
    };
  }
}
