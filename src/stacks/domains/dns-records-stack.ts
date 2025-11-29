import { Construct } from 'constructs';
import { CfnOutput, Fn } from 'aws-cdk-lib';
import { HostedZone, IHostedZone, ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { BaseStack, type BaseStackProps } from '../base/base-stack';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

/**
 * DNS Records Stack
 *
 * This stack creates DNS records (ALIAS records) in Route53 hosted zones that point to
 * CloudFront distributions or ALBs. It depends on RootDomainStack and CloudFrontAndCertStack.
 *
 * **Architecture:**
 * - Deployed in Management Account
 * - Creates ALIAS records in Route53 hosted zones
 * - Points to CloudFront distributions (same account)
 * - Points to ALBs (cross-account via domain name)
 * - Handles both apex and subdomain records
 *
 * **Features:**
 * - Automatic ALIAS record creation for CloudFront distributions
 * - Support for cross-account ALB targets
 * - Apex domain support
 * - Consistent naming and tagging
 *
 * **Usage:**
 * ```typescript
 * new DnsRecordsStack(this, 'DnsRecords', {
 *   stackConfig: {
 *     project: 'CodeIQLabs',
 *     environment: 'mgmt',
 *     region: 'us-east-1',
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
 *         - name: "www.example.com"
 *           type: "marketing"
 *           cloudfront:
 *             enabled: true
 *         - name: "api.example.com"
 *           type: "api"
 *           cloudfront:
 *             enabled: false
 *           alb:
 *             account: "719640820326"
 *             region: "us-east-1"
 * ```
 *
 * **Dependencies:**
 * - RootDomainStack (for hosted zones)
 * - CloudFrontAndCertStack (for CloudFront distributions)
 * - Workload account ALB stacks (for ALB targets)
 *
 * **Deployment Frequency:** Frequent (whenever CloudFront or ALB endpoints change)
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

    // TODO: Fix type issue with domains property
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
    // Determine target based on configuration
    if (subdomain.cloudfront?.enabled) {
      // CloudFront distribution target
      this.createCloudFrontRecord(subdomain, hostedZone, domainIndex, subdomainIndex);
    } else if (subdomain.alb) {
      // ALB target (cross-account or same account)
      this.createAlbRecord(subdomain);
    } else {
      // No target configured - skip
      return;
    }
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

    // Import CloudFront distribution domain name from CloudFrontAndCertStack
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
   * Create ALIAS record pointing to ALB
   */
  private createAlbRecord(subdomain: any): void {
    const subdomainName = subdomain.name;
    const albConfig = subdomain.alb;

    if (!albConfig.account || !albConfig.region) {
      throw new Error(
        `ALB configuration for ${subdomainName} is missing required account or region`,
      );
    }

    // For cross-account ALB, we need to use the ALB's DNS name
    // This would typically be imported from the workload account stack
    // For now, we'll create a placeholder that expects the ALB DNS name to be exported

    // Note: Importing the ALB DNS name for reference (not currently used in implementation)
    Fn.importValue(
      `${this.getStackConfig().project}-${albConfig.account}-${albConfig.region}-alb-${this.sanitizeDomainName(subdomainName)}-dns`,
    );

    // Note: Cross-account ALB ALIAS records require the ALB to be in a public hosted zone
    // or we need to use CNAME records instead. For simplicity, we'll use a comment here
    // indicating this needs to be implemented based on specific ALB setup

    // TODO: Implement proper cross-account ALB ALIAS record
    // This may require custom resource or CNAME record depending on setup

    new CfnOutput(this, `${this.sanitizeDomainName(subdomainName)}AlbRecordPlaceholder`, {
      value: `${subdomainName} -> ALB (${albConfig.account}/${albConfig.region})`,
      description: `Placeholder for ALB DNS record for ${subdomainName}`,
      exportName: this.naming.exportName(
        `${this.sanitizeDomainName(subdomainName)}-alb-record-placeholder`,
      ),
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
