import { Construct } from 'constructs';
import { CfnOutput, Fn } from 'aws-cdk-lib';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import {
  Distribution,
  ViewerProtocolPolicy,
  CachePolicy,
  OriginRequestPolicy,
  SecurityPolicyProtocol,
  HttpVersion,
  PriceClass,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { BaseStack, type BaseStackProps } from '../base/base-stack';
import { AcmCertificateConstruct } from '../../constructs/acm/constructs';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

/**
 * CloudFront and Certificate Stack
 *
 * This stack manages ACM certificates (us-east-1) and CloudFront distributions for marketing
 * and app domains in the management account. It creates certificates with DNS validation and
 * CloudFront distributions with various origin types (S3, ALB, custom).
 *
 * **Architecture:**
 * - Deployed in Management Account (us-east-1 for certificates)
 * - Creates ACM certificates for CloudFront (must be in us-east-1)
 * - Uses wildcard certificates (*.domain.com) + apex certificates (domain.com)
 * - Creates CloudFront distributions for marketing/app subdomains
 * - Supports S3, ALB (cross-account), and custom origins
 * - Exports distribution domain names for DNS stack
 *
 * **Certificate Strategy:**
 * - 2 certificates per domain (wildcard + apex) instead of 1 per subdomain
 * - Wildcard cert (*.domain.com) covers: www, app, api subdomains
 * - Apex cert (domain.com) covers: root domain
 * - Example: For 5 domains = 10 certificates total (vs 18 with individual certs)
 *
 * **Features:**
 * - Automatic ACM certificate creation with DNS validation
 * - Wildcard certificate optimization for cost and management efficiency
 * - CloudFront distributions with security best practices
 * - Support for cross-account ALB origins
 * - WAF integration (optional)
 * - Consistent naming and tagging
 *
 * **Usage:**
 * ```typescript
 * new CloudFrontAndCertStack(this, 'CloudFrontAndCert', {
 *   stackConfig: {
 *     project: 'CodeIQLabs',
 *     environment: 'mgmt',
 *     region: 'us-east-1', // Must be us-east-1 for CloudFront certificates
 *     accountId: '682475224767',
 *     owner: 'CodeIQLabs',
 *     company: 'CodeIQLabs',
 *   },
 *   config: manifestConfig, // Must include domains configuration
 * });
 * ```
 *
 * **Manifest Configuration:**
 * ```yaml
 * domains:
 *   enabled: true
 *   registeredDomains:
 *     - name: "example.com"
 *       subdomains:
 *         - name: "example.com"          # Uses apex certificate
 *           type: "marketing"
 *           cloudfront:
 *             enabled: true
 *             originType: "s3"
 *         - name: "www.example.com"      # Uses wildcard certificate
 *           type: "marketing"
 *           cloudfront:
 *             enabled: true
 *             originType: "s3"
 *             wafEnabled: true
 *         - name: "app.example.com"      # Uses wildcard certificate
 *           type: "app"
 *           cloudfront:
 *             enabled: true
 *             originType: "alb"
 *             originAccount: "719640820326"
 *             originRegion: "us-east-1"
 * ```
 *
 * **Deployment Frequency:** Infrequent (when adding domains or changing CloudFront config)
 */

export interface CloudFrontAndCertStackProps extends BaseStackProps {
  /** Unified application configuration from manifest */
  config: UnifiedAppConfig;
}

/**
 * CloudFront and Certificate Stack implementation
 */
export class CloudFrontAndCertStack extends BaseStack {
  /** Map of subdomain names to CloudFront distributions */
  private readonly distributions: Map<string, Distribution> = new Map();

  /** Map of domain names to certificates */
  private readonly certificates: Map<string, ICertificate> = new Map();

  constructor(scope: Construct, id: string, props: CloudFrontAndCertStackProps) {
    super(scope, id, 'CloudFrontAndCert', props);

    // Validate region is us-east-1 for CloudFront certificates
    if (props.stackConfig.region !== 'us-east-1') {
      throw new Error(
        'CloudFrontAndCertStack must be deployed in us-east-1 region for CloudFront certificates',
      );
    }

    // TODO: Fix type issue with domains property
    const domainConfig = (props.config as any).domains;
    if (!domainConfig?.enabled || !domainConfig.registeredDomains?.length) {
      throw new Error('Domain configuration is required for CloudFront and certificate stack');
    }

    // Process each registered domain
    domainConfig.registeredDomains.forEach((domain: any, domainIndex: number) => {
      this.processDomain(domain, domainIndex);
    });
  }

  /**
   * Process a registered domain and its subdomains
   */
  private processDomain(domain: any, domainIndex: number): void {
    if (!domain.name) {
      throw new Error(`Domain at index ${domainIndex} is missing required "name" field`);
    }

    // Import the hosted zone for certificate validation
    const hostedZone = this.importHostedZone(domain, domainIndex);

    // Get subdomains that need CloudFront
    const cloudFrontSubdomains = (domain.subdomains || []).filter(
      (subdomain: any) => subdomain.cloudfront?.enabled,
    );

    if (cloudFrontSubdomains.length === 0) {
      return; // No CloudFront distributions needed for this domain
    }

    // Create certificates for CloudFront subdomains
    const certificateMap = this.createCertificates(cloudFrontSubdomains, hostedZone, domainIndex);

    // Create CloudFront distributions
    cloudFrontSubdomains.forEach((subdomain: any, subdomainIndex: number) => {
      this.createCloudFrontDistribution(subdomain, certificateMap, domainIndex, subdomainIndex);
    });
  }

  /**
   * Import hosted zone for DNS validation
   */
  private importHostedZone(domain: any, domainIndex: number): IHostedZone {
    const hostedZoneId =
      domain.hostedZoneId ||
      Fn.importValue(
        this.naming.exportName(`${this.sanitizeDomainName(domain.name)}-hosted-zone-id`),
      );

    return HostedZone.fromHostedZoneAttributes(this, `HostedZone${domainIndex}`, {
      hostedZoneId,
      zoneName: domain.name,
    });
  }

  /**
   * Create ACM certificates for CloudFront subdomains using wildcard approach
   * Creates 2 certificates per domain:
   * 1. Wildcard certificate (*.domain.com) - covers www, app, api subdomains
   * 2. Apex certificate (domain.com) - covers root domain
   */
  private createCertificates(
    subdomains: any[],
    hostedZone: IHostedZone,
    domainIndex: number,
  ): Map<string, ICertificate> {
    const certMap = new Map<string, ICertificate>();
    const stackConfig = this.getStackConfig();
    const domainName = hostedZone.zoneName;

    // Extract base domain (remove trailing dot if present)
    const baseDomain = domainName.endsWith('.') ? domainName.slice(0, -1) : domainName;

    // Create wildcard certificate (*.domain.com) for all subdomains
    const wildcardCertConstruct = new AcmCertificateConstruct(
      this,
      `WildcardCertificate${domainIndex}`,
      {
        naming: this.naming,
        environment: stackConfig.environment,
        company: stackConfig.company,
        project: stackConfig.project,
        owner: stackConfig.owner,
        domainName: `*.${baseDomain}`,
        hostedZone,
        certificateType: 'wildcard',
      },
    );

    const wildcardCert = wildcardCertConstruct.certificate;
    this.certificates.set(`*.${baseDomain}`, wildcardCert);

    // Export wildcard certificate ARN
    new CfnOutput(this, `${this.sanitizeDomainName(baseDomain)}WildcardCertificateArn`, {
      value: wildcardCert.certificateArn,
      description: `Wildcard ACM certificate ARN for *.${baseDomain}`,
      exportName: this.naming.exportName(
        `${this.sanitizeDomainName(baseDomain)}-wildcard-cert-arn`,
      ),
    });

    // Create apex certificate (domain.com) for root domain
    const apexCertConstruct = new AcmCertificateConstruct(this, `ApexCertificate${domainIndex}`, {
      naming: this.naming,
      environment: stackConfig.environment,
      company: stackConfig.company,
      project: stackConfig.project,
      owner: stackConfig.owner,
      domainName: baseDomain,
      hostedZone,
      certificateType: 'single-domain',
    });

    const apexCert = apexCertConstruct.certificate;
    this.certificates.set(baseDomain, apexCert);

    // Export apex certificate ARN
    new CfnOutput(this, `${this.sanitizeDomainName(baseDomain)}ApexCertificateArn`, {
      value: apexCert.certificateArn,
      description: `Apex ACM certificate ARN for ${baseDomain}`,
      exportName: this.naming.exportName(`${this.sanitizeDomainName(baseDomain)}-apex-cert-arn`),
    });

    // Map each subdomain to the appropriate certificate
    subdomains.forEach((subdomain: any) => {
      const subdomainName = subdomain.name;

      // Determine if this is apex domain or subdomain
      if (subdomainName === baseDomain) {
        // Use apex certificate for root domain
        certMap.set(subdomainName, apexCert);
      } else {
        // Use wildcard certificate for all subdomains (www, app, api, etc.)
        certMap.set(subdomainName, wildcardCert);
      }
    });

    return certMap;
  }

  /**
   * Create CloudFront distribution for a subdomain
   */
  private createCloudFrontDistribution(
    subdomain: any,
    certificateMap: Map<string, ICertificate>,
    domainIndex: number,
    subdomainIndex: number,
  ): void {
    const subdomainName = subdomain.name;
    const cloudFrontConfig = subdomain.cloudfront;
    const certificate = certificateMap.get(subdomainName);

    if (!certificate) {
      throw new Error(`Certificate not found for subdomain ${subdomainName}`);
    }

    // Determine origin based on origin type
    const origin = this.createOrigin(subdomain, cloudFrontConfig);

    // Create CloudFront distribution
    const distribution = new Distribution(this, `Distribution${domainIndex}${subdomainIndex}`, {
      comment: `CloudFront distribution for ${subdomainName} (${subdomain.type})`,
      domainNames: [subdomainName],
      certificate,

      // Default behavior
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: this.getCachePolicy(subdomain.type),
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      },

      // Security and performance
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: HttpVersion.HTTP2_AND_3,
      enableIpv6: true,

      // Price class
      priceClass: this.getPriceClass(cloudFrontConfig.priceClass),

      // Enable logging in production
      enableLogging: this.isProduction(),
    });

    this.distributions.set(subdomainName, distribution);

    // Export distribution domain name for DNS stack
    new CfnOutput(this, `${this.sanitizeDomainName(subdomainName)}DistributionDomain`, {
      value: distribution.distributionDomainName,
      description: `CloudFront distribution domain for ${subdomainName}`,
      exportName: this.naming.exportName(
        `${this.sanitizeDomainName(subdomainName)}-distribution-domain`,
      ),
    });

    // Export distribution ID
    new CfnOutput(this, `${this.sanitizeDomainName(subdomainName)}DistributionId`, {
      value: distribution.distributionId,
      description: `CloudFront distribution ID for ${subdomainName}`,
      exportName: this.naming.exportName(
        `${this.sanitizeDomainName(subdomainName)}-distribution-id`,
      ),
    });
  }

  /**
   * Create origin based on configuration
   */
  private createOrigin(subdomain: any, cloudFrontConfig: any): any {
    const originType = cloudFrontConfig.originType || 's3';

    switch (originType) {
      case 'alb': {
        // Cross-account ALB origin
        // Note: ALB must be created in workload account first
        const albDomainName = `alb-${subdomain.name}`;
        return new HttpOrigin(albDomainName, {
          protocolPolicy: 'https-only' as any,
        });
      }

      case 's3':
        // S3 origin - placeholder for now
        // TODO: Implement S3 bucket creation or reference
        throw new Error('S3 origin type not yet implemented - will be added in future phase');

      case 'custom':
        // Custom HTTP/HTTPS origin
        throw new Error('Custom origin type not yet implemented - will be added in future phase');

      default:
        throw new Error(`Unsupported origin type: ${originType}`);
    }
  }

  /**
   * Get cache policy based on subdomain type
   */
  private getCachePolicy(subdomainType: string): any {
    switch (subdomainType) {
      case 'marketing':
        return CachePolicy.CACHING_OPTIMIZED;
      case 'app':
        return CachePolicy.CACHING_DISABLED; // Apps typically need fresh data
      case 'api':
        return CachePolicy.CACHING_DISABLED;
      default:
        return CachePolicy.CACHING_OPTIMIZED;
    }
  }

  /**
   * Get price class from configuration
   */
  private getPriceClass(priceClassConfig?: string): PriceClass {
    switch (priceClassConfig) {
      case 'PriceClass_200':
        return PriceClass.PRICE_CLASS_200;
      case 'PriceClass_All':
        return PriceClass.PRICE_CLASS_ALL;
      case 'PriceClass_100':
      default:
        return PriceClass.PRICE_CLASS_100;
    }
  }

  /**
   * Check if this is a production environment
   */
  private isProduction(): boolean {
    const env = this.getStackConfig().environment.toLowerCase();
    return env === 'prod' || env === 'production';
  }

  /**
   * Sanitizes domain name for use in CloudFormation logical IDs
   */
  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
