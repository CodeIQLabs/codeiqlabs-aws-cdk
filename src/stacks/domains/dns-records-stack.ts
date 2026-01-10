import { Construct } from 'constructs';
import { Fn } from 'aws-cdk-lib';
import { HostedZone, IHostedZone, ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { BaseStack, type BaseStackProps } from '../base/base-stack';
import type { UnifiedAppConfig, SaasEdgeApp } from '@codeiqlabs/aws-utils';

/**
 * DNS Records Stack
 *
 * Creates ALIAS records in Route53 hosted zones pointing to CloudFront distributions.
 * Subdomains are derived from saasEdge (convention-over-configuration).
 *
 * **Architecture:**
 * - Deployed in Management Account
 * - Creates ALIAS records: {subdomain}.{brand} → CloudFront distribution
 * - Handles both apex and subdomain records
 *
 * **Derived Subdomains:**
 * - Marketing distributions (prod): {domain} (apex), www.{domain}
 * - Marketing distributions (nprd): www-{env}.{domain} (avoids NS delegation conflict)
 * - Webapp distributions: app.{domain}, {env}-app.{domain}
 * - API distributions: api.{domain}, {env}-api.{domain}
 *
 * **NS Delegation Architecture:**
 * - {env}.{domain} (e.g., nprd.savvue.com) is reserved for NS delegation to workload zones
 * - Marketing sites use www-{env}.{domain} to avoid conflict with NS records
 *
 * **Dependencies:**
 * - RootDomainStack (for hosted zones)
 * - CloudFrontVpcOriginStack (for CloudFront distributions)
 */

export interface DnsRecordsStackProps extends BaseStackProps {
  /** Unified application configuration from manifest */
  config: UnifiedAppConfig;
  /** Target environments for DNS records (e.g., ['nprd', 'prod']) */
  targetEnvironments: string[];
}

interface DerivedSubdomain {
  fqdn: string;
  domain: string;
  aliases?: string[];
}

/**
 * DNS Records Stack implementation
 */
export class DnsRecordsStack extends BaseStack {
  /** Map of record names to A records */
  private readonly records: Map<string, ARecord> = new Map();

  constructor(scope: Construct, id: string, props: DnsRecordsStackProps) {
    super(scope, id, 'DnsRecords', props);

    // Derive domains from saasEdge
    const saasEdge = (props.config as any).saasEdge as SaasEdgeApp[] | undefined;
    const domainConfig = (props.config as any).domains;

    if (!saasEdge || saasEdge.length === 0) {
      throw new Error('saasEdge configuration is required for DnsRecordsStack');
    }

    // Build unique domain list for hosted zone imports
    const domainMap = new Map<string, { name: string; hostedZoneId?: string }>();
    for (const app of saasEdge) {
      if (!domainMap.has(app.domain)) {
        domainMap.set(app.domain, { name: app.domain });
      }
    }

    // Merge with explicit registeredDomains (can provide hostedZoneId)
    if (domainConfig?.registeredDomains) {
      for (const domain of domainConfig.registeredDomains) {
        domainMap.set(domain.name, domain);
      }
    }

    // Import hosted zones
    const hostedZones = new Map<string, IHostedZone>();
    for (const domain of domainMap.values()) {
      hostedZones.set(domain.name, this.importHostedZone(domain));
    }

    // Derive subdomains from saasEdge
    const subdomains = this.deriveSubdomains(saasEdge, props.targetEnvironments);

    // Create DNS records for each subdomain
    for (const subdomain of subdomains) {
      const hostedZone = hostedZones.get(subdomain.domain);
      if (hostedZone) {
        this.createCloudFrontRecord(subdomain, hostedZone);
      }
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
              domain: app.domain,
              aliases,
            });
          }
        } else {
          // Webapp/API subdomains for each environment
          for (const env of targetEnvironments) {
            const prefix = env === 'prod' ? '' : `${env}-`;
            const subdomain = distribution.type === 'webapp' ? 'app' : 'api';

            subdomains.push({
              fqdn: `${prefix}${subdomain}.${app.domain}`,
              domain: app.domain,
            });
          }
        }
      }
    }

    return subdomains;
  }

  /**
   * Import hosted zone
   */
  private importHostedZone(domain: any): IHostedZone {
    const hostedZoneId =
      domain.hostedZoneId ||
      Fn.importValue(
        this.naming.exportName(`${this.sanitizeDomainName(domain.name)}-hosted-zone-id`),
      );

    // Use stable logical ID based on domain name
    const logicalId = `HostedZone${this.sanitizeDomainName(domain.name)}`;

    return HostedZone.fromHostedZoneAttributes(this, logicalId, {
      hostedZoneId,
      zoneName: domain.name,
    });
  }

  /**
   * Create ALIAS record pointing to CloudFront distribution
   */
  private createCloudFrontRecord(subdomain: DerivedSubdomain, hostedZone: IHostedZone): void {
    const subdomainName = subdomain.fqdn;

    // Import CloudFront distribution domain name from CloudFrontVpcOriginStack
    const distributionDomain = Fn.importValue(
      this.naming.exportName(`${this.sanitizeDomainName(subdomainName)}-distribution-domain`),
    );

    // Use stable logical ID based on FQDN
    // Examples: RecordCodeiqlabsCom, RecordNprdSavvueCom, RecordAppTimislyCom
    const logicalId = `Record${this.sanitizeDomainName(subdomainName)}`;

    // Create ALIAS record pointing to CloudFront
    const record = new ARecord(this, logicalId, {
      zone: hostedZone,
      recordName: subdomainName,
      target: RecordTarget.fromAlias({
        bind: () => ({
          dnsName: distributionDomain,
          hostedZoneId: 'Z2FDTNDATAQYW2', // CloudFront hosted zone ID (constant)
        }),
      }),
      comment: `ALIAS record for ${subdomainName} pointing to CloudFront distribution`,
    });

    this.records.set(subdomainName, record);

    // Create records for aliases too (e.g., www.savvue.com)
    for (const alias of subdomain.aliases || []) {
      const aliasDistributionDomain = Fn.importValue(
        this.naming.exportName(`${this.sanitizeDomainName(alias)}-distribution-domain`),
      );

      // Use stable logical ID based on alias FQDN
      const aliasLogicalId = `Record${this.sanitizeDomainName(alias)}`;

      const aliasRecord = new ARecord(this, aliasLogicalId, {
        zone: hostedZone,
        recordName: alias,
        target: RecordTarget.fromAlias({
          bind: () => ({
            dnsName: aliasDistributionDomain,
            hostedZoneId: 'Z2FDTNDATAQYW2',
          }),
        }),
        comment: `ALIAS record for ${alias} pointing to CloudFront distribution`,
      });

      this.records.set(alias, aliasRecord);
    }
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
