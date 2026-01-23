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
 * Bucket type for static hosting
 * - marketing: Marketing site (Next.js static export) - bucket prefix: static-{brand}
 * - webapp: Web application (React Native Web / Expo) - bucket prefix: webapp-{brand}
 */
export type StaticBucketType = 'marketing' | 'webapp';

/**
 * Brand bucket configuration
 */
export interface BrandBucketConfig {
  /**
   * Brand name (e.g., "savvue", "equitrio")
   */
  brand: string;

  /**
   * Bucket type - determines naming prefix and SSM parameter path
   * - marketing: static-{brand}, /{company}/{project}/{env}/static/{brand}/bucket-name
   * - webapp: webapp-{brand}, /{company}/{project}/{env}/webapp/{brand}/bucket-name
   */
  type: StaticBucketType;
}

/**
 * Static Site configuration
 */
export interface StaticSiteConfig {
  /**
   * List of brands to create S3 buckets for (legacy - creates marketing buckets)
   * @deprecated Use brandBuckets instead for explicit bucket type control
   */
  brands?: string[];

  /**
   * List of brand bucket configurations with explicit types
   * Allows creating both marketing and webapp buckets for the same brand
   */
  brandBuckets?: BrandBucketConfig[];

  /**
   * Management account ID for CloudFront OAC access
   * If not provided, will be looked up from SSM: /{company}/org/management-account-id
   * @optional
   */
  managementAccountId?: string;

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
    const stackConfig = this.getStackConfig();
    const company = stackConfig.company.toLowerCase();

    // Get management account ID from config or SSM parameter
    const managementAccountId =
      config.managementAccountId ||
      ssm.StringParameter.valueFromLookup(this, `/${company}/org/management-account-id`);

    // Build unified bucket list from both legacy brands and new brandBuckets
    // Legacy brands array creates marketing buckets for backward compatibility
    const bucketConfigs: BrandBucketConfig[] = [
      ...(config.brands?.map((brand) => ({ brand, type: 'marketing' as const })) ?? []),
      ...(config.brandBuckets ?? []),
    ];

    // Create S3 bucket for each brand/type combination
    for (const bucketConfig of bucketConfigs) {
      const { brand, type } = bucketConfig;

      // Determine bucket prefix and SSM path based on type
      // marketing: static-{brand}, /{company}/{project}/{env}/static/{brand}/bucket-name
      // webapp: webapp-{brand}, /{company}/{project}/{env}/webapp/{brand}/bucket-name
      const bucketPrefix = type === 'marketing' ? 'static' : 'webapp';
      const ssmPathPrefix = type === 'marketing' ? 'static' : 'webapp';

      // Use unique construct ID to allow both marketing and webapp for same brand
      const constructId = `${brand}-${type}`;

      // Create S3 bucket for static assets
      const bucket = new s3.Bucket(this, `${constructId}Bucket`, {
        bucketName: this.naming.s3BucketName(`${bucketPrefix}-${brand}`),
        versioned: enableVersioning,
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        // Enable static website hosting for SPA routing
        websiteIndexDocument: 'index.html',
        websiteErrorDocument: 'index.html', // SPA fallback
      });
      // Store with type-prefixed key to allow both types for same brand
      this.buckets.set(`${type}-${brand}`, bucket);

      // Add bucket policy for CloudFront OAC access from Management account
      bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'AllowCloudFrontOAC',
          effect: iam.Effect.ALLOW,
          principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
          actions: ['s3:GetObject'],
          resources: [bucket.arnForObjects('*')],
          conditions: {
            StringLike: {
              'AWS:SourceArn': `arn:aws:cloudfront::${managementAccountId}:distribution/*`,
            },
          },
        }),
      );

      // Create SSM parameter for bucket info (for cross-account CloudFront configuration)
      const ssmParameterPath = this.naming.ssmParameterName(
        `${ssmPathPrefix}/${brand}`,
        'bucket-name',
      );
      const bucketParameter = new ssm.StringParameter(this, `${constructId}BucketParameter`, {
        parameterName: ssmParameterPath,
        stringValue: bucket.bucketName,
        description: `S3 bucket name for ${brand} ${type} site`,
        tier: ssm.ParameterTier.STANDARD,
      });
      this.bucketParameters.set(`${type}-${brand}`, bucketParameter);

      // Also store bucket regional domain name for CloudFront origin
      const domainParameterPath = this.naming.ssmParameterName(
        `${ssmPathPrefix}/${brand}`,
        'bucket-domain',
      );
      new ssm.StringParameter(this, `${constructId}BucketDomainParameter`, {
        parameterName: domainParameterPath,
        stringValue: bucket.bucketRegionalDomainName,
        description: `S3 bucket regional domain for ${brand} ${type} site`,
        tier: ssm.ParameterTier.STANDARD,
      });

      // Export bucket name
      new cdk.CfnOutput(this, `${constructId}BucketName`, {
        value: bucket.bucketName,
        exportName: this.naming.exportName(`${bucketPrefix}-${brand}-bucket`),
        description: `S3 bucket name for ${brand} ${type} site`,
      });

      // Export bucket ARN
      new cdk.CfnOutput(this, `${constructId}BucketArn`, {
        value: bucket.bucketArn,
        exportName: this.naming.exportName(`${bucketPrefix}-${brand}-bucket-arn`),
        description: `S3 bucket ARN for ${brand} ${type} site`,
      });

      // Export bucket regional domain name
      new cdk.CfnOutput(this, `${constructId}BucketDomain`, {
        value: bucket.bucketRegionalDomainName,
        exportName: this.naming.exportName(`${bucketPrefix}-${brand}-bucket-domain`),
        description: `S3 bucket regional domain for ${brand} ${type} site`,
      });
    }
  }
}
