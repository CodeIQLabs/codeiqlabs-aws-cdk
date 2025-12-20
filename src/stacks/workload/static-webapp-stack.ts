/**
 * Static Web App Stack for Workload Infrastructure
 *
 * Creates S3 buckets for hosting static web applications (Expo Web builds).
 * CloudFront distribution is created in the Management account and references
 * these S3 buckets as origins using OAC (Origin Access Control).
 *
 * Architecture:
 * - S3 bucket in workload account for static assets
 * - Bucket policy allows CloudFront OAC from Management account
 * - SSM parameter exports bucket info for cross-account CloudFront configuration
 *
 * @example
 * ```typescript
 * new StaticWebAppStack(app, 'WebApp', {
 *   stackConfig: {
 *     project: 'MyProject',
 *     environment: 'nprd',
 *     region: 'us-east-1',
 *     accountId: '123456789012',
 *     owner: 'MyCompany',
 *     company: 'MyCompany',
 *   },
 *   siteConfig: {
 *     brands: ['acme', 'globex', 'initech'],
 *   },
 * });
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Static Site configuration
 */
export interface StaticSiteConfig {
  /**
   * List of brands to create S3 buckets for
   */
  brands: string[];

  /**
   * Management account ID for CloudFront OAC access
   */
  managementAccountId: string;

  /**
   * Enable versioning on S3 buckets
   * @default true
   */
  enableVersioning?: boolean;

  /**
   * Enable server access logging
   * @default false
   */
  enableAccessLogging?: boolean;
}

/**
 * Props for StaticWebAppStack
 */
export interface StaticWebAppStackProps extends BaseStackProps {
  /**
   * Static site configuration
   */
  siteConfig: StaticSiteConfig;
}

/**
 * Static Web App Stack for workload infrastructure
 *
 * Creates S3 buckets for static web app hosting with CloudFront OAC access.
 * Exports bucket information via SSM parameters for cross-account CloudFront configuration.
 */
export class StaticWebAppStack extends BaseStack {
  /**
   * Map of brand name to S3 bucket
   */
  public readonly buckets: Map<string, s3.IBucket> = new Map();

  /**
   * Map of brand name to SSM parameter containing bucket info
   */
  public readonly bucketParameters: Map<string, ssm.IStringParameter> = new Map();

  constructor(scope: Construct, id: string, props: StaticWebAppStackProps) {
    super(scope, id, 'StaticHosting', props);

    const config = props.siteConfig;
    const enableVersioning = config.enableVersioning ?? true;

    // Create S3 bucket for each brand
    for (const brand of config.brands) {
      // Create S3 bucket for static assets
      const bucket = new s3.Bucket(this, `${brand}Bucket`, {
        bucketName: this.naming.s3BucketName(`static-${brand}`),
        versioned: enableVersioning,
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        // Enable static website hosting for SPA routing
        websiteIndexDocument: 'index.html',
        websiteErrorDocument: 'index.html', // SPA fallback
      });
      this.buckets.set(brand, bucket);

      // Add bucket policy for CloudFront OAC access from Management account
      // The CloudFront distribution in Management account will use OAC to access this bucket
      bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'AllowCloudFrontOAC',
          effect: iam.Effect.ALLOW,
          principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
          actions: ['s3:GetObject'],
          resources: [bucket.arnForObjects('*')],
          conditions: {
            StringEquals: {
              'AWS:SourceAccount': config.managementAccountId,
            },
          },
        }),
      );

      // Create SSM parameter for bucket info (for cross-account CloudFront configuration)
      // Pattern: /{company}/{project}/{env}/static/{brand}/bucket-name (derived from manifest)
      const ssmParameterPath = this.naming.ssmParameterName(`static/${brand}`, 'bucket-name');
      const bucketParameter = new ssm.StringParameter(this, `${brand}BucketParameter`, {
        parameterName: ssmParameterPath,
        stringValue: bucket.bucketName,
        description: `S3 bucket name for ${brand} static site`,
        tier: ssm.ParameterTier.STANDARD,
      });
      this.bucketParameters.set(brand, bucketParameter);

      // Also store bucket regional domain name for CloudFront origin
      // Pattern: /{company}/{project}/{env}/static/{brand}/bucket-domain (derived from manifest)
      const domainParameterPath = this.naming.ssmParameterName(`static/${brand}`, 'bucket-domain');
      new ssm.StringParameter(this, `${brand}BucketDomainParameter`, {
        parameterName: domainParameterPath,
        stringValue: bucket.bucketRegionalDomainName,
        description: `S3 bucket regional domain for ${brand} static site`,
        tier: ssm.ParameterTier.STANDARD,
      });

      // Export bucket name
      new cdk.CfnOutput(this, `${brand}BucketName`, {
        value: bucket.bucketName,
        exportName: this.naming.exportName(`static-${brand}-bucket`),
        description: `S3 bucket name for ${brand} static site`,
      });

      // Export bucket ARN
      new cdk.CfnOutput(this, `${brand}BucketArn`, {
        value: bucket.bucketArn,
        exportName: this.naming.exportName(`static-${brand}-bucket-arn`),
        description: `S3 bucket ARN for ${brand} static site`,
      });

      // Export bucket regional domain name
      new cdk.CfnOutput(this, `${brand}BucketDomain`, {
        value: bucket.bucketRegionalDomainName,
        exportName: this.naming.exportName(`static-${brand}-bucket-domain`),
        description: `S3 bucket regional domain for ${brand} static site`,
      });
    }
  }
}
