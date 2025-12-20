import { Construct } from 'constructs';
import { CfnOutput, Fn } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {
  CachePolicy,
  Distribution,
  HttpVersion,
  type IOriginAccessControl,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  S3OriginAccessControl,
  SecurityPolicyProtocol,
  Signing,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BaseStack, type BaseStackProps } from '../base/base-stack';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

export interface CloudFrontDistributionStackProps extends BaseStackProps {
  /** Unified application configuration from manifest */
  config: UnifiedAppConfig;
}

/**
 * Subdomain configuration
 */
interface SubdomainConfig {
  name: string;
  type: string;
  brand: string;
  wafProfile: string;
  cloudfront: any;
  alb: any;
  s3: any;
  /** Additional domain names (CNAMEs) for this distribution */
  aliases?: string[];
}

/**
 * CloudFrontDistributionStack (Stage 2)
 *
 * Creates ONE CloudFront distribution per subdomain entry in the manifest.
 * Each distribution routes to the correct origin based on subdomain type:
 * - Marketing sites (apex, nprd.*) → S3 bucket origin
 * - App/API sites (app.*, api.*, nprd-app.*, nprd-api.*) → ALB origin
 *
 * Architecture:
 * - 26 distributions (one per subdomain entry, apex+www consolidated via aliases)
 * - S3 origins use Origin Access Control (OAC) for secure access
 * - ALB origins use stable origin hostnames (e.g., origin-prod-webapp.savvue.com)
 *   that are Route53 CNAMEs pointing to the current ALB DNS
 * - Marketing sites can have aliases (e.g., www.savvue.com as alias of savvue.com)
 *
 * Stable Origin Hostname Pattern:
 * - CloudFront always points to stable origin hostnames (never changes)
 * - Route53 CNAME records are updated when ALB changes (fast, safe)
 * - Eliminates cross-account SSM lookups and CloudFront origin mutations
 *
 * See: cloudfront-architecture-adr.md for rationale
 */
export class CloudFrontDistributionStack extends BaseStack {
  private readonly distributions = new Map<string, Distribution>();
  private originAccessControl: IOriginAccessControl | undefined;
  private distributionIndex = 0;

  constructor(scope: Construct, id: string, props: CloudFrontDistributionStackProps) {
    super(scope, id, 'CloudFrontDistributions', props);

    const domainConfig = (props.config as any).domains;

    if (!domainConfig?.enabled || !domainConfig.registeredDomains?.length) {
      throw new Error('Domain configuration is required for CloudFrontDistributionStack');
    }

    // Create Origin Access Control for S3 origins (shared across all S3 distributions)
    const stackConfig = this.getStackConfig();
    this.originAccessControl = new S3OriginAccessControl(this, 'S3OriginAccessControl', {
      originAccessControlName: `${stackConfig.project}-${stackConfig.environment}-s3-oac`,
      description: 'OAC for S3 bucket origins',
      signing: Signing.SIGV4_ALWAYS,
    });

    // Create ONE distribution per subdomain across all brands
    domainConfig.registeredDomains.forEach((domain: any) => {
      this.createSubdomainDistributions(domain);
    });
  }

  /**
   * Create distributions for all subdomains of a registered domain
   */
  private createSubdomainDistributions(domain: any): void {
    const domainName = domain.name;
    const subdomains = domain.subdomains ?? [];

    // Filter enabled subdomains and create a distribution for each
    subdomains
      .filter((s: any) => s.cloudfront?.enabled)
      .forEach((subdomain: any) => {
        const config: SubdomainConfig = {
          name: subdomain.name,
          type: subdomain.type,
          brand: subdomain.brand ?? this.extractBrandFromDomain(domainName),
          wafProfile: subdomain.cloudfront?.wafConfig?.profile ?? 'prod',
          cloudfront: subdomain.cloudfront,
          alb: subdomain.alb,
          s3: subdomain.s3,
          aliases: subdomain.aliases ?? [],
        };

        this.createSubdomainDistribution(config, domainName, this.distributionIndex++);
      });
  }

  /**
   * Create a single CloudFront distribution for one subdomain (with optional aliases)
   */
  private createSubdomainDistribution(
    subdomain: SubdomainConfig,
    parentDomain: string,
    index: number,
  ): void {
    const originType = subdomain.cloudfront?.originType ?? 's3';
    const certificateArn = this.importCertificateForDomain(parentDomain);

    // Create origin based on type
    const origin = this.createOrigin(subdomain, originType);

    // Determine cache policy based on origin type
    const cachePolicy =
      originType === 's3' ? CachePolicy.CACHING_OPTIMIZED : CachePolicy.CACHING_DISABLED;

    // Build domain names list: primary domain + any aliases (e.g., www.savvue.com)
    const aliases = subdomain.aliases ?? [];
    const domainNames = [subdomain.name, ...aliases];
    const aliasComment = aliases.length > 0 ? ` + ${aliases.join(', ')}` : '';

    // Create the distribution
    const distribution = new Distribution(this, `Distribution${index}`, {
      comment: `CloudFront for ${subdomain.name}${aliasComment} (${originType} origin)`,
      domainNames,
      certificate: undefined as any, // imported by ARN via override below

      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy,
        originRequestPolicy:
          originType === 's3' ? OriginRequestPolicy.CORS_S3_ORIGIN : OriginRequestPolicy.ALL_VIEWER,
      },

      // SPA error handling for S3 origins
      errorResponses:
        originType === 's3'
          ? [
              { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
              { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
            ]
          : undefined,

      defaultRootObject: originType === 's3' ? 'index.html' : undefined,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      priceClass: PriceClass.PRICE_CLASS_100,
      enableLogging: false,
    } as any);

    // Override certificate using imported ARN
    this.applyCertificateOverrides(distribution, certificateArn);

    // Store distribution for primary domain and all aliases
    this.distributions.set(subdomain.name, distribution);
    aliases.forEach((alias) => this.distributions.set(alias, distribution));

    // Export distribution info for DNS records stack (primary domain)
    const sanitizedName = this.sanitizeDomainName(subdomain.name);
    new CfnOutput(this, `${sanitizedName}DistDomain`, {
      value: distribution.distributionDomainName,
      description: `CloudFront domain for ${subdomain.name}${aliasComment}`,
      exportName: this.naming.exportName(`${sanitizedName}-distribution-domain`),
    });

    new CfnOutput(this, `${sanitizedName}DistId`, {
      value: distribution.distributionId,
      description: `CloudFront ID for ${subdomain.name}${aliasComment}`,
      exportName: this.naming.exportName(`${sanitizedName}-distribution-id`),
    });

    // Export distribution domain for each alias (needed for DNS records)
    aliases.forEach((alias) => {
      const sanitizedAlias = this.sanitizeDomainName(alias);
      new CfnOutput(this, `${sanitizedAlias}DistDomain`, {
        value: distribution.distributionDomainName,
        description: `CloudFront domain for ${alias} (alias of ${subdomain.name})`,
        exportName: this.naming.exportName(`${sanitizedAlias}-distribution-domain`),
      });
    });
  }

  /**
   * Create the appropriate origin based on subdomain type
   */
  private createOrigin(subdomain: SubdomainConfig, originType: string): any {
    if (originType === 's3') {
      return this.createS3Origin(subdomain);
    } else {
      return this.createAlbOrigin(subdomain);
    }
  }

  /**
   * Create S3 bucket origin with OAC
   */
  private createS3Origin(subdomain: SubdomainConfig): any {
    const s3Config = subdomain.s3;
    if (!s3Config?.account || !s3Config?.region) {
      throw new Error(`S3 configuration missing for ${subdomain.name}`);
    }

    // Bucket name must be provided in manifest s3.bucketName
    // This is required because bucket names include a hash suffix (e.g., saas-prod-static-codeiqlabs-9987f1)
    if (!s3Config.bucketName) {
      throw new Error(
        `S3 bucket name missing for ${subdomain.name}. ` +
          `Please specify s3.bucketName in the manifest (e.g., saas-prod-static-${subdomain.brand}-XXXXXX)`,
      );
    }

    // Use fromBucketName to import the bucket (requires bucket name for OAC)
    const bucket = s3.Bucket.fromBucketName(
      this,
      `${this.sanitizeDomainName(subdomain.name)}Bucket`,
      s3Config.bucketName,
    );

    return S3BucketOrigin.withOriginAccessControl(bucket, {
      originAccessControl: this.originAccessControl,
    });
  }

  /**
   * Create ALB origin using stable origin hostname
   *
   * Uses a stable origin hostname (e.g., webapp.origin-prod.savvue.com) that is
   * resolved via Route53 zone delegation to the workload account's hosted zone.
   *
   * **Zone Delegation Architecture:**
   * - Management account delegates origin-{env}.{brand} to workload account
   * - Workload account creates Alias A records: {service}.origin-{env}.{brand} → ALB
   * - CloudFront uses the stable origin hostname (never changes)
   *
   * This decouples CloudFront from ALB changes:
   * - CloudFront always points to the stable origin hostname (never changes)
   * - Workload account updates Alias records when ALB changes (automatic)
   * - No cross-account SSM lookups or custom resources needed
   */
  private createAlbOrigin(subdomain: SubdomainConfig): any {
    const originHostname = subdomain.alb?.originHostname;

    if (!originHostname) {
      throw new Error(
        `Missing alb.originHostname for ${subdomain.name}. ` +
          `Expected format: {service}.origin-{env}.{brand}`,
      );
    }

    return new HttpOrigin(originHostname, {
      protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
      httpPort: 80,
      httpsPort: 443,
    });
  }

  /**
   * Apply certificate overrides to distribution
   */
  private applyCertificateOverrides(distribution: Distribution, certificateArn: string): void {
    const cfnDist = distribution.node.defaultChild as any;
    cfnDist.addPropertyOverride(
      'DistributionConfig.ViewerCertificate.AcmCertificateArn',
      certificateArn,
    );
    cfnDist.addPropertyOverride(
      'DistributionConfig.ViewerCertificate.SslSupportMethod',
      'sni-only',
    );
    cfnDist.addPropertyOverride(
      'DistributionConfig.ViewerCertificate.MinimumProtocolVersion',
      'TLSv1.2_2021',
    );
    cfnDist.addPropertyDeletionOverride('ViewerCertificate');
  }

  private importCertificateForDomain(domainName: string): string {
    const baseDomain = domainName.endsWith('.') ? domainName.slice(0, -1) : domainName;
    const sanitized = this.sanitizeDomainName(baseDomain);
    return Fn.importValue(this.naming.exportName(`${sanitized}-wildcard-cert-arn`));
  }

  /**
   * Extract brand from domain name (e.g., savvue.com → savvue)
   */
  private extractBrandFromDomain(domainName: string): string {
    return domainName.split('.')[0];
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
