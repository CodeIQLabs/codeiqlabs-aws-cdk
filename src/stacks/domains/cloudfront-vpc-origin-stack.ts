/**
 * CloudFront VPC Origin Stack
 *
 * Creates CloudFront distributions using hybrid DNS delegation architecture.
 * ALB origins use delegated subdomain pattern (alb.{env}.{brand}.com) that resolves
 * via NS delegation to workload account zones. No SSM lookups required.
 *
 * **Hybrid DNS Delegation Architecture:**
 * - User-facing domains (api.savvue.com) → CloudFront (in management account)
 * - CloudFront origins (alb.nprd.savvue.com) → Delegated subdomain zones (in workload accounts)
 * - Delegated zones (nprd.savvue.com) → ALB A records (alb.nprd.savvue.com → ALB)
 *
 * **DNS Resolution Flow:**
 * 1. User requests https://api.savvue.com
 * 2. DNS resolves to CloudFront distribution (A record in savvue.com zone)
 * 3. CloudFront fetches from origin: alb.prod.savvue.com
 * 4. DNS query for alb.prod.savvue.com:
 *    - savvue.com zone has NS record: prod.savvue.com → workload zone NS
 *    - prod.savvue.com zone (workload account) has A record: alb → ALB
 * 5. CloudFront connects to ALB via resolved IP
 *
 * **Origin Patterns:**
 * - ALB Origins: alb.{env}.{brand}.com (e.g., alb.nprd.savvue.com)
 * - S3 Origins: OAC for secure static site access
 *
 * **Derived Subdomains (per environment):**
 * - Marketing distributions (prod): {domain} (apex), www.{domain} → S3 Origin
 * - Marketing distributions (nprd): www-{env}.{domain} → S3 Origin (avoids NS delegation conflict)
 * - Webapp distributions (prod): app.{domain} → ALB Origin (alb.prod.{domain})
 * - Webapp distributions (nprd): {env}-app.{domain} → ALB Origin (alb.{env}.{domain})
 * - API distributions (prod): api.{domain} → ALB Origin (alb.prod.{domain})
 * - API distributions (nprd): {env}-api.{domain} → ALB Origin (alb.{env}.{domain})
 *
 * **NS Delegation Architecture:**
 * - {env}.{domain} (e.g., nprd.savvue.com) is reserved for NS delegation to workload zones
 * - Marketing sites use www-{env}.{domain} to avoid conflict with NS records
 * - This allows both marketing (S3) and ALB origins to coexist via DNS delegation
 */

import { Construct } from 'constructs';
import { CfnOutput, Fn } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { BaseStack, type BaseStackProps } from '../base/base-stack';
import type { UnifiedAppConfig, SaasEdgeApp } from '@codeiqlabs/aws-utils';
import { ResourceNaming } from '@codeiqlabs/aws-utils';

export interface CloudFrontVpcOriginStackProps extends BaseStackProps {
  /** Unified application configuration from manifest */
  config: UnifiedAppConfig;
  /** Target environments for ALB origins (e.g., ['nprd', 'prod']) */
  targetEnvironments: string[];
  /** WAF Web ACL ARN for prod distributions */
  prodWebAclArn?: string;
  /** WAF Web ACL ARN for nprd distributions */
  nprdWebAclArn?: string;
}

interface DerivedSubdomain {
  fqdn: string;
  type: 'marketing' | 'webapp' | 'api';
  brand: string;
  domain: string;
  environment: string; // 'prod' for production, 'nprd' for non-prod, etc.
  originType: 'alb' | 's3' | 'apiGateway';
  aliases?: string[];
}

/**
 * CloudFront VPC Origin Stack
 *
 * Creates CloudFront distributions with predictable Route53 origin domains for ALB connectivity.
 */
export class CloudFrontVpcOriginStack extends BaseStack {
  private readonly distributions = new Map<string, cloudfront.CfnDistribution>();
  private originAccessControl: cloudfront.CfnOriginAccessControl | undefined;
  private readonly config: UnifiedAppConfig;
  private readonly prodWebAclArn?: string;
  private readonly nprdWebAclArn?: string;

  constructor(scope: Construct, id: string, props: CloudFrontVpcOriginStackProps) {
    super(scope, id, 'CloudFront', props);

    this.config = props.config;
    this.prodWebAclArn = props.prodWebAclArn;
    this.nprdWebAclArn = props.nprdWebAclArn;
    const saasEdge = (props.config as any).saasEdge as SaasEdgeApp[] | undefined;

    if (!saasEdge || saasEdge.length === 0) {
      throw new Error('saasEdge configuration is required for CloudFrontVpcOriginStack');
    }

    const stackConfig = this.getStackConfig();

    // Hybrid DNS Delegation Architecture:
    // CloudFront origins use delegated subdomain pattern: alb.{env}.{brand}.com
    // These resolve via NS delegation to workload account zones
    // No SSM lookups needed - DNS resolution happens at runtime
    // Example: alb.nprd.savvue.com → NS delegation → workload zone → ALB

    // Create Origin Access Control for S3 origins
    // S3 buckets are in workload accounts; CloudFront accesses them via cross-account OAC
    this.originAccessControl = new cloudfront.CfnOriginAccessControl(this, 'S3Oac', {
      originAccessControlConfig: {
        name: `${stackConfig.project}-${stackConfig.environment}-s3-oac`,
        description: 'OAC for S3 bucket origins (cross-account access to workload buckets)',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
      },
    });

    // Derive subdomains from saasEdge
    const subdomains = this.deriveSubdomains(saasEdge, props.targetEnvironments);

    // S3 buckets for webapp and marketing sites are created in workload accounts
    // by StaticWebAppStack in saas-aws. CloudFront references them via cross-account OAC.
    // Bucket policies in workload accounts allow CloudFront OAC from management account.

    // Create distributions for each subdomain
    for (const subdomain of subdomains) {
      this.createDistribution(subdomain);
    }
  }

  /**
   * Derive subdomains from saasEdge configuration
   */
  private deriveSubdomains(
    saasEdge: SaasEdgeApp[],
    targetEnvironments: string[],
  ): DerivedSubdomain[] {
    const subdomains: DerivedSubdomain[] = [];

    for (const app of saasEdge) {
      // Extract brand name from domain (e.g., "savvue.com" → "savvue")
      const brand = app.domain.split('.')[0];

      for (const distribution of app.distributions) {
        if (distribution.type === 'marketing') {
          // Marketing distributions for each environment
          // IMPORTANT: Non-prod uses www-{env}.{domain} to avoid NS delegation conflict
          // The {env}.{domain} subdomain is reserved for NS delegation to workload zones
          for (const env of targetEnvironments) {
            const fqdn = env === 'prod' ? app.domain : `www-${env}.${app.domain}`;
            const aliases = env === 'prod' ? [`www.${app.domain}`] : undefined;

            subdomains.push({
              fqdn,
              type: 'marketing',
              brand,
              domain: app.domain,
              environment: env,
              originType: 's3',
              aliases,
            });
          }
        } else {
          // Webapp/API subdomains for each environment
          for (const env of targetEnvironments) {
            const prefix = env === 'prod' ? '' : `${env}-`;
            const subdomain = distribution.type === 'webapp' ? 'app' : 'api';

            // Determine origin type:
            // - webapp can use ALB (ECS Fargate) or S3 (static SPA)
            // - api can use ALB or API Gateway based on originType config
            // - Default to 'alb' for backward compatibility
            let originType: 'alb' | 'apiGateway' | 's3' = 'alb';
            if (distribution.type === 'webapp' && distribution.originType === 's3') {
              originType = 's3';
            } else if (distribution.type === 'api' && distribution.originType === 'apiGateway') {
              originType = 'apiGateway';
            }

            subdomains.push({
              fqdn: `${prefix}${subdomain}.${app.domain}`,
              type: distribution.type,
              brand,
              domain: app.domain,
              environment: env,
              originType,
            });
          }
        }
      }
    }

    return subdomains;
  }

  /**
   * Create a CloudFront distribution for a subdomain
   */
  private createDistribution(subdomain: DerivedSubdomain): void {
    const certificateArn = this.importCertificateForDomain(subdomain.domain);

    // Build domain names (FQDN + aliases)
    const domainNames = [subdomain.fqdn, ...(subdomain.aliases || [])];

    // Create origin configuration based on type
    const origins = this.createOriginConfig(subdomain);

    // Generate stable logical ID from FQDN
    // Examples: NprdCodeiqlabsCom, AppSavvueCom, NprdApiEquitrioCom
    const logicalId = this.generateStableLogicalId(subdomain.fqdn);

    // Select WAF Web ACL based on environment
    // prod distributions use prodWebAclArn (open access)
    // nprd distributions use nprdWebAclArn (IP-restricted)
    const webAclArn = subdomain.environment === 'prod' ? this.prodWebAclArn : this.nprdWebAclArn;

    // Create distribution using L1 CfnDistribution
    const distribution = new cloudfront.CfnDistribution(this, logicalId, {
      distributionConfig: {
        enabled: true,
        comment: `CloudFront for ${subdomain.fqdn} (${subdomain.originType})`,
        aliases: domainNames,
        origins,
        defaultCacheBehavior: this.createCacheBehavior(subdomain, origins[0].id),
        // Additional cache behaviors for S3 origins to properly cache static assets
        // while keeping index.html uncached for SPA deployments
        cacheBehaviors:
          subdomain.originType === 's3' ? this.createS3CacheBehaviors(origins[0].id) : undefined,
        viewerCertificate: {
          acmCertificateArn: certificateArn,
          sslSupportMethod: 'sni-only',
          minimumProtocolVersion: 'TLSv1.2_2021',
        },
        httpVersion: 'http2and3',
        ipv6Enabled: true,
        priceClass: 'PriceClass_100',
        // Associate WAF Web ACL for IP restriction (nprd) or managed rules (prod)
        webAclId: webAclArn,
        // SPA error handling for S3 origins
        customErrorResponses:
          subdomain.originType === 's3'
            ? [
                { errorCode: 403, responseCode: 200, responsePagePath: '/index.html' },
                { errorCode: 404, responseCode: 200, responsePagePath: '/index.html' },
              ]
            : undefined,
        defaultRootObject: subdomain.originType === 's3' ? 'index.html' : undefined,
      },
    });

    this.distributions.set(subdomain.fqdn, distribution);

    // Export distribution domain for DNS records
    const sanitizedName = this.sanitizeDomainName(subdomain.fqdn);
    new CfnOutput(this, `${sanitizedName}DistDomain`, {
      value: distribution.attrDomainName,
      description: `CloudFront domain for ${subdomain.fqdn}`,
      exportName: this.naming.exportName(`${sanitizedName}-distribution-domain`),
    });

    // Export for aliases too
    for (const alias of subdomain.aliases || []) {
      const sanitizedAlias = this.sanitizeDomainName(alias);
      new CfnOutput(this, `${sanitizedAlias}DistDomain`, {
        value: distribution.attrDomainName,
        description: `CloudFront domain for ${alias}`,
        exportName: this.naming.exportName(`${sanitizedAlias}-distribution-domain`),
      });
    }

    // Create SSM parameter for distribution ID (for GitHub Actions cache invalidation)
    // Pattern: /codeiqlabs/saas/{env}/cloudfront/{brand}/{type}/distribution-id
    // Note: This is created in the management account where CloudFront lives.
    // GitHub Actions switches to management account credentials before looking up this parameter.
    const company = this.config.naming.company.toLowerCase();
    new ssm.StringParameter(this, `${sanitizedName}DistIdParam`, {
      parameterName: `/${company}/saas/${subdomain.environment}/cloudfront/${subdomain.brand}/${subdomain.type}/distribution-id`,
      stringValue: distribution.attrId,
      description: `CloudFront distribution ID for ${subdomain.fqdn}`,
      tier: ssm.ParameterTier.STANDARD,
    });
  }

  /**
   * Create origin configuration for the distribution
   */
  private createOriginConfig(
    subdomain: DerivedSubdomain,
  ): cloudfront.CfnDistribution.OriginProperty[] {
    const originId = `origin-${subdomain.brand}-${subdomain.type}`;

    if (subdomain.originType === 'alb') {
      // Hybrid DNS Delegation Pattern:
      // Origin domain: alb.{env}.{brand}.com
      // Example: alb.nprd.savvue.com (for nprd environment, savvue brand)
      // This resolves via NS delegation:
      //   1. DNS query for alb.nprd.savvue.com
      //   2. savvue.com zone has NS record: nprd.savvue.com → workload zone NS
      //   3. nprd.savvue.com zone (in workload account) has A record: alb → ALB
      const originDomain = `alb.${subdomain.environment}.${subdomain.domain}`;

      // Custom headers for ALB routing
      // X-Forwarded-Brand: Identifies which brand this request is for (e.g., 'savvue', 'timisly')
      // X-Forwarded-Service: Identifies which service type (e.g., 'webapp', 'api')
      // ALB listener rules will match on these headers instead of path patterns
      const customHeaders = [
        {
          headerName: 'X-Forwarded-Brand',
          headerValue: subdomain.brand,
        },
        {
          headerName: 'X-Forwarded-Service',
          headerValue: subdomain.type,
        },
      ];

      return [
        {
          id: originId,
          domainName: originDomain, // Delegated subdomain origin
          customOriginConfig: {
            httpPort: 80,
            httpsPort: 443,
            originProtocolPolicy: 'https-only', // Force HTTPS to ALB
            originSslProtocols: ['TLSv1.2'],
            originReadTimeout: 30,
            originKeepaliveTimeout: 5,
          },
          originCustomHeaders: customHeaders,
        },
      ];
    } else if (subdomain.originType === 'apiGateway') {
      // API Gateway Origin Pattern:
      // Origin domain: api-gw.{env}.{brand}.com
      // Example: api-gw.nprd.savvue.com (for nprd environment, savvue brand)
      // This resolves via NS delegation:
      //   1. DNS query for api-gw.nprd.savvue.com
      //   2. savvue.com zone has NS record: nprd.savvue.com → workload zone NS
      //   3. nprd.savvue.com zone (in workload account) has A record: api-gw → API Gateway
      const originDomain = `api-gw.${subdomain.environment}.${subdomain.domain}`;

      // Custom headers for API Gateway routing and Auth.js cookie domain support
      // X-Forwarded-Host: The viewer-facing CloudFront domain (e.g., nprd-api.savvue.com)
      //   This is critical for Auth.js to set cookies with the correct domain.
      //   Since we use AllViewerExceptHostHeader, the Lambda receives Host: api-gw.nprd.savvue.com
      //   but cookies need to be set for the viewer domain (nprd-api.savvue.com).
      const customHeaders = [
        {
          headerName: 'X-Forwarded-Brand',
          headerValue: subdomain.brand,
        },
        {
          headerName: 'X-Forwarded-Service',
          headerValue: subdomain.type,
        },
        {
          headerName: 'X-Forwarded-Host',
          headerValue: subdomain.fqdn,
        },
      ];

      return [
        {
          id: originId,
          domainName: originDomain, // Delegated subdomain origin
          customOriginConfig: {
            httpPort: 80,
            httpsPort: 443,
            originProtocolPolicy: 'https-only', // Force HTTPS to API Gateway
            originSslProtocols: ['TLSv1.2'],
            originReadTimeout: 30,
            originKeepaliveTimeout: 5,
          },
          originCustomHeaders: customHeaders,
        },
      ];
    } else {
      // S3 origin for marketing sites and static webapps
      const stackConfig = this.getStackConfig();
      const bucketName = this.deriveS3BucketName(
        subdomain.brand,
        subdomain.environment,
        subdomain.type,
      );
      const bucketDomainName = `${bucketName}.s3.${stackConfig.region}.amazonaws.com`;

      return [
        {
          id: originId,
          domainName: bucketDomainName,
          s3OriginConfig: {
            originAccessIdentity: '', // Empty for OAC
          },
          originAccessControlId: this.originAccessControl!.attrId,
        },
      ];
    }
  }

  /**
   * Create cache behavior for the distribution
   */
  private createCacheBehavior(
    subdomain: DerivedSubdomain,
    originId: string,
  ): cloudfront.CfnDistribution.DefaultCacheBehaviorProperty {
    if (subdomain.originType === 's3') {
      // For S3 SPA origins, the DEFAULT behavior handles index.html and unknown paths
      // Use CachingDisabled so users always get the latest index.html after deployments
      // Static assets (JS/CSS with hashes) are cached via additional cache behaviors
      return {
        targetOriginId: originId,
        viewerProtocolPolicy: 'redirect-to-https',
        cachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', // CachingDisabled for index.html
        originRequestPolicyId: '88a5eaf4-2fd4-4709-b370-b4c650ea3fcf', // CORS-S3Origin
        compress: true,
        allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
        cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
      };
    } else if (subdomain.originType === 'apiGateway') {
      // API Gateway requires Host header to match its custom domain (api-gw.{env}.{brand}.com)
      // Use AllViewerExceptHostHeader so CloudFront sends the origin domain as Host header
      // instead of the viewer's Host header (e.g., nprd-api.savvue.com)
      return {
        targetOriginId: originId,
        viewerProtocolPolicy: 'redirect-to-https',
        cachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', // CachingDisabled
        originRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac', // AllViewerExceptHostHeader
        compress: true,
        allowedMethods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
        cachedMethods: ['GET', 'HEAD'],
      };
    } else {
      // ALB origin - can use AllViewer since ALB doesn't validate Host header
      return {
        targetOriginId: originId,
        viewerProtocolPolicy: 'redirect-to-https',
        cachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', // CachingDisabled
        originRequestPolicyId: '216adef6-5c7f-47e4-b989-5492eafa07d3', // AllViewer
        compress: true,
        allowedMethods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
        cachedMethods: ['GET', 'HEAD'],
      };
    }
  }

  /**
   * Create additional cache behaviors for S3 SPA origins
   *
   * These behaviors cache static assets (JS, CSS, images, fonts) with long TTLs
   * since they have content hashes in their filenames. The default behavior
   * (index.html) uses CachingDisabled so users always get the latest version.
   *
   * Pattern priority (lower number = higher priority):
   * 1. /assets/* - Vite/Expo bundled assets with hashes (1 year cache)
   * 2. /_next/* - Next.js static assets (1 year cache)
   * 3. /static/* - Generic static assets (1 year cache)
   * 4. *.js, *.css - Root level bundled files with hashes (1 year cache)
   * 5. Default (*) - index.html and unknown paths (no cache)
   */
  private createS3CacheBehaviors(
    originId: string,
  ): cloudfront.CfnDistribution.CacheBehaviorProperty[] {
    // CachingOptimized policy ID - caches based on origin headers, 1 day default TTL
    const cachingOptimizedPolicyId = '658327ea-f89d-4fab-a63d-7e88639e58f6';
    const corsS3OriginPolicyId = '88a5eaf4-2fd4-4709-b370-b4c650ea3fcf';

    const baseBehavior = {
      targetOriginId: originId,
      viewerProtocolPolicy: 'redirect-to-https' as const,
      cachePolicyId: cachingOptimizedPolicyId,
      originRequestPolicyId: corsS3OriginPolicyId,
      compress: true,
      allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
      cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
    };

    return [
      // Vite/Expo bundled assets (highest priority)
      { ...baseBehavior, pathPattern: '/assets/*' },
      // Next.js static assets
      { ...baseBehavior, pathPattern: '/_next/*' },
      // Generic static folder
      { ...baseBehavior, pathPattern: '/static/*' },
      // Images
      { ...baseBehavior, pathPattern: '*.png' },
      { ...baseBehavior, pathPattern: '*.jpg' },
      { ...baseBehavior, pathPattern: '*.jpeg' },
      { ...baseBehavior, pathPattern: '*.gif' },
      { ...baseBehavior, pathPattern: '*.svg' },
      { ...baseBehavior, pathPattern: '*.ico' },
      { ...baseBehavior, pathPattern: '*.webp' },
      // Fonts
      { ...baseBehavior, pathPattern: '*.woff' },
      { ...baseBehavior, pathPattern: '*.woff2' },
      { ...baseBehavior, pathPattern: '*.ttf' },
      { ...baseBehavior, pathPattern: '*.eot' },
    ];
  }

  /**
   * Derive S3 bucket name for CloudFront origins
   *
   * Both marketing and webapp S3 buckets are created in workload accounts by
   * StaticWebAppStack in saas-aws. CloudFront accesses them via cross-account OAC.
   *
   * For marketing sites:
   *   Convention: saas-{env}-static-{brand}[-{hash}]
   *   The hash is generated using the workload account's accountId and region.
   *
   * For webapp sites (static SPAs):
   *   Convention: saas-{env}-webapp-{brand}[-{hash}]
   *   The hash is generated using the workload account's accountId and region.
   */
  private deriveS3BucketName(
    brand: string,
    environment: string,
    distributionType: 'marketing' | 'webapp' | 'api',
  ): string {
    // Get workload account configuration for the target environment
    const envConfig = this.config.environments?.[environment];
    if (!envConfig) {
      throw new Error(
        `Environment '${environment}' not found in manifest. ` +
          `Available: ${Object.keys(this.config.environments || {}).join(', ')}`,
      );
    }

    // Both webapp and marketing S3 buckets are in workload accounts
    // Create a ResourceNaming instance with the workload account's configuration
    // This ensures the hash matches what was generated in StaticWebAppStack
    const workloadNaming = new ResourceNaming({
      company: this.config.naming.company,
      project: 'SaaS', // Hardcoded to match saas-aws project name
      environment: environment,
      region: envConfig.region,
      accountId: envConfig.accountId,
    });

    // Determine bucket prefix based on distribution type
    // webapp: webapp-{brand}, marketing: static-{brand}
    const bucketPrefix = distributionType === 'webapp' ? 'webapp' : 'static';

    // Generate bucket name with the same hash as StaticWebAppStack
    return workloadNaming.s3BucketName(`${bucketPrefix}-${brand}`);
  }

  /**
   * Import certificate ARN for a domain
   */
  private importCertificateForDomain(domainName: string): string {
    const baseDomain = domainName.endsWith('.') ? domainName.slice(0, -1) : domainName;
    const sanitized = this.sanitizeDomainName(baseDomain);
    return Fn.importValue(this.naming.exportName(`${sanitized}-wildcard-cert-arn`));
  }

  /**
   * Sanitize domain name for CloudFormation logical IDs
   */
  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }

  /**
   * Generate stable logical ID for CloudFront distribution
   * Uses FQDN to create a predictable, stable ID that won't change when distributions are added/removed
   *
   * Examples:
   * - codeiqlabs.com → CodeiqlabsCom
   * - nprd.savvue.com → NprdSavvueCom
   * - app.timisly.com → AppTimislyCom
   * - nprd-api.equitrio.com → NprdApiEquitrioCom
   */
  private generateStableLogicalId(fqdn: string): string {
    return this.sanitizeDomainName(fqdn);
  }

  /**
   * Get all distributions
   */
  public getDistributions(): Map<string, cloudfront.CfnDistribution> {
    return this.distributions;
  }
}
