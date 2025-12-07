import { Construct } from 'constructs';
import { CfnOutput, Fn } from 'aws-cdk-lib';
import {
  CachePolicy,
  Distribution,
  HttpVersion,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
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
  wafProfile: string;
  cloudfront: any;
  alb: any;
}

/**
 * CloudFrontDistributionStack (Stage 2)
 *
 * Creates ONE CloudFront distribution per brand (registered domain).
 * Uses a placeholder origin until ALBs are deployed in workload accounts.
 *
 * Architecture:
 * - N distributions (one per brand defined in manifest)
 * - Each distribution has multiple alternate domain names (apex, www, app, api, nprd.*)
 * - Uses placeholder origin (will be updated when ALBs are deployed)
 *
 * NOTE: This is a simplified version that uses a placeholder origin.
 * Once ALBs are deployed in workload accounts, this can be enhanced to use
 * dynamic origin lookup via custom resources.
 */
export class CloudFrontDistributionStack extends BaseStack {
  private readonly distributions = new Map<string, Distribution>();

  constructor(scope: Construct, id: string, props: CloudFrontDistributionStackProps) {
    super(scope, id, 'CloudFrontDistributions', props);

    const domainConfig = (props.config as any).domains;
    if (!domainConfig?.enabled || !domainConfig.registeredDomains?.length) {
      throw new Error('Domain configuration is required for CloudFrontDistributionStack');
    }

    // Create ONE distribution per registered domain (brand)
    domainConfig.registeredDomains.forEach((domain: any, domainIndex: number) => {
      this.createBrandDistribution(domain, domainIndex);
    });
  }

  private importCertificateForDomain(domainName: string): string {
    const baseDomain = domainName.endsWith('.') ? domainName.slice(0, -1) : domainName;
    const sanitized = this.sanitizeDomainName(baseDomain);

    // Import the combined certificate (covers both apex and wildcard)
    return Fn.importValue(this.naming.exportName(`${sanitized}-wildcard-cert-arn`));
  }

  /**
   * Create ONE CloudFront distribution for a brand (registered domain)
   * Groups all subdomains under a single distribution
   */
  private createBrandDistribution(domain: any, domainIndex: number): void {
    const domainName = domain.name;
    const subdomains = domain.subdomains ?? [];

    // Filter enabled subdomains
    const enabledSubdomains: SubdomainConfig[] = subdomains
      .filter((s: any) => s.cloudfront?.enabled)
      .map((s: any) => ({
        name: s.name,
        type: s.type,
        wafProfile: s.cloudfront?.wafConfig?.profile ?? 'prod',
        cloudfront: s.cloudfront,
        alb: s.alb,
      }));

    if (enabledSubdomains.length === 0) {
      return;
    }

    // Collect all alternate domain names
    const allDomainNames = enabledSubdomains.map((s) => s.name);

    // Import certificate for this domain (combined cert covers apex + wildcard)
    const certificateArn = this.importCertificateForDomain(domainName);

    // Use a simple HTTP origin as placeholder (will be replaced when ALBs are deployed)
    // Using example.com as a placeholder - it's a valid domain that always responds
    const placeholderOrigin = new HttpOrigin('example.com', {
      protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
      originId: 'placeholder-origin',
    });

    // Create the distribution (WAF will be added later)
    const distribution = new Distribution(this, `Distribution${domainIndex}`, {
      comment: `CloudFront distribution for ${domainName} (${allDomainNames.length} subdomains)`,
      domainNames: allDomainNames,
      certificate: undefined as any, // imported by ARN via override below

      defaultBehavior: {
        origin: placeholderOrigin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      },

      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      priceClass: PriceClass.PRICE_CLASS_100,
      enableLogging: false, // Disable logging for now
    } as any);

    // Override certificate using imported ARN
    // ViewerCertificate must be inside DistributionConfig, not at the top level
    (distribution as any).node.defaultChild.addPropertyOverride(
      'DistributionConfig.ViewerCertificate.AcmCertificateArn',
      certificateArn,
    );
    (distribution as any).node.defaultChild.addPropertyOverride(
      'DistributionConfig.ViewerCertificate.SslSupportMethod',
      'sni-only',
    );
    (distribution as any).node.defaultChild.addPropertyOverride(
      'DistributionConfig.ViewerCertificate.MinimumProtocolVersion',
      'TLSv1.2_2021',
    );
    // Remove the incorrectly placed top-level ViewerCertificate
    (distribution as any).node.defaultChild.addPropertyDeletionOverride('ViewerCertificate');

    this.distributions.set(domainName, distribution);

    // Export distribution info for DNS records stack
    new CfnOutput(this, `${this.sanitizeDomainName(domainName)}DistributionDomain`, {
      value: distribution.distributionDomainName,
      description: `CloudFront distribution domain for ${domainName}`,
      exportName: this.naming.exportName(
        `${this.sanitizeDomainName(domainName)}-distribution-domain`,
      ),
    });

    new CfnOutput(this, `${this.sanitizeDomainName(domainName)}DistributionId`, {
      value: distribution.distributionId,
      description: `CloudFront distribution ID for ${domainName}`,
      exportName: this.naming.exportName(`${this.sanitizeDomainName(domainName)}-distribution-id`),
    });

    // Also export for each subdomain (for DNS records compatibility)
    // Skip apex domain since it's already exported above
    for (const subdomain of enabledSubdomains) {
      if (subdomain.name === domainName) {
        continue; // Skip apex domain - already exported
      }
      new CfnOutput(this, `${this.sanitizeDomainName(subdomain.name)}DistributionDomain`, {
        value: distribution.distributionDomainName,
        description: `CloudFront distribution domain for ${subdomain.name}`,
        exportName: this.naming.exportName(
          `${this.sanitizeDomainName(subdomain.name)}-distribution-domain`,
        ),
      });
    }
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
