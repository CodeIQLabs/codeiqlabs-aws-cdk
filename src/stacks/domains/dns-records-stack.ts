import { Construct } from 'constructs';
import { CfnOutput, Fn } from 'aws-cdk-lib';
import { HostedZone, IHostedZone, ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { BaseStack, type BaseStackProps } from '../base/base-stack';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

/**
 * DNS Records Stack
 *
 * Creates ALIAS records in Route53 hosted zones pointing to CloudFront distributions.
 *
 * **Architecture:**
 * - Deployed in Management Account
 * - Creates ALIAS records: {subdomain}.{brand} → CloudFront distribution
 * - Handles both apex and subdomain records
 * - Also creates ALIAS records for aliases (e.g., www.savvue.com)
 *
 * **Note:** Origin CNAME records (origin-{env}-{service}.{brand} → ALB) are now
 * handled by OriginCnameRecordsStack, which is deployed before this stack.
 *
 * **Dependencies:**
 * - RootDomainStack (for hosted zones)
 * - CloudFrontDistributionStack (for CloudFront distributions)
 */

export interface DnsRecordsStackProps extends BaseStackProps {
  /** Unified application configuration from manifest */
  config: UnifiedAppConfig;
}

/**
 * DNS Records Stack implementation
 */
export class DnsRecordsStack extends BaseStack {
  /** Map of record names to A records */
  private readonly records: Map<string, ARecord> = new Map();

  constructor(scope: Construct, id: string, props: DnsRecordsStackProps) {
    super(scope, id, 'DnsRecords', props);

    const domainConfig = (props.config as any).domains;

    if (!domainConfig?.enabled || !domainConfig.registeredDomains?.length) {
      throw new Error('Domain configuration is required for DNS records stack');
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

    // Import the hosted zone
    const hostedZone = this.importHostedZone(domain, domainIndex);

    // Get all subdomains that need DNS records
    const subdomains = domain.subdomains || [];

    subdomains.forEach((subdomain: any, subdomainIndex: number) => {
      if (!subdomain.enabled) {
        return; // Skip disabled subdomains
      }

      this.createDnsRecord(subdomain, hostedZone, domainIndex, subdomainIndex);
    });
  }

  /**
   * Import hosted zone
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
   * Create DNS record for a subdomain
   */
  private createDnsRecord(
    subdomain: any,
    hostedZone: IHostedZone,
    domainIndex: number,
    subdomainIndex: number,
  ): void {
    // Only create records for CloudFront-enabled subdomains
    if (subdomain.cloudfront?.enabled) {
      this.createCloudFrontRecord(subdomain, hostedZone, domainIndex, subdomainIndex);
    }
    // Note: Origin CNAME records are now handled by OriginCnameRecordsStack
  }

  /**
   * Create ALIAS record pointing to CloudFront distribution
   */
  private createCloudFrontRecord(
    subdomain: any,
    hostedZone: IHostedZone,
    domainIndex: number,
    subdomainIndex: number,
  ): void {
    const subdomainName = subdomain.name;

    // Import CloudFront distribution domain name from CloudFrontDistributionStack
    const distributionDomain = Fn.importValue(
      this.naming.exportName(`${this.sanitizeDomainName(subdomainName)}-distribution-domain`),
    );

    // Create ALIAS record pointing to CloudFront
    // Note: We use a custom ALIAS target instead of CloudFrontTarget because we're importing
    // the distribution domain from another stack and don't have the IDistribution object
    const record = new ARecord(this, `CloudFrontRecord${domainIndex}${subdomainIndex}`, {
      zone: hostedZone,
      recordName: subdomainName,
      target: RecordTarget.fromAlias({
        bind: () => ({
          dnsName: distributionDomain,
          hostedZoneId: 'Z2FDTNDATAQYW2', // CloudFront hosted zone ID (constant for all CloudFront distributions)
        }),
      }),
      comment: `ALIAS record for ${subdomainName} pointing to CloudFront distribution`,
    });

    this.records.set(subdomainName, record);

    // Export record information
    new CfnOutput(this, `${this.sanitizeDomainName(subdomainName)}RecordCreated`, {
      value: `${subdomainName} -> CloudFront`,
      description: `DNS record for ${subdomainName}`,
      exportName: this.naming.exportName(`${this.sanitizeDomainName(subdomainName)}-dns-record`),
    });
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

  /**
   * Get all DNS records
   */
  public getAllRecords(): Map<string, ARecord> {
    return this.records;
  }
}
