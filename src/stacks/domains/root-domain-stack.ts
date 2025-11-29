import { Construct } from 'constructs';
import { CfnOutput, Fn } from 'aws-cdk-lib';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { BaseStack, type BaseStackProps } from '../base/base-stack';
import { Route53HostedZoneConstruct } from '../../constructs/route53/constructs';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Root Domain Stack
 *
 * This stack manages Route53 hosted zones for all registered domains in the management account.
 * It creates or imports hosted zones and exports their IDs and name servers for use by other stacks.
 *
 * **Architecture:**
 * - Deployed in Management Account
 * - Creates/imports Route53 hosted zones for each registered domain
 * - Exports hosted zone IDs for CloudFront and DNS stacks
 * - Exports name servers for domain registrar configuration
 *
 * **Features:**
 * - Automatic hosted zone creation for new domains
 * - Import existing hosted zones by ID
 * - Consistent naming and tagging
 * - CloudFormation exports for cross-stack references
 *
 * **Usage:**
 * ```typescript
 * new RootDomainStack(this, 'RootDomain', {
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
 *       hostedZoneId: "Z1234567890ABC"  # Optional - import existing
 *       registrar: "route53"
 *       autoRenew: true
 *     - name: "newdomain.com"
 *       # No hostedZoneId - will create new hosted zone
 *       registrar: "route53"
 * ```
 *
 * **Deployment Frequency:** Rare (only when adding new domains)
 */

export interface RootDomainStackProps extends BaseStackProps {
  /** Unified application configuration from manifest */
  config: UnifiedAppConfig;
}

/**
 * Root Domain Stack implementation
 */
export class RootDomainStack extends BaseStack {
  /** Map of domain names to hosted zones */
  private readonly hostedZones: Map<string, IHostedZone> = new Map();

  constructor(scope: Construct, id: string, props: RootDomainStackProps) {
    super(scope, id, 'RootDomain', props);

    // TODO: Fix type issue with domains property
    const domainConfig = (props.config as any).domains;
    if (!domainConfig?.enabled || !domainConfig.registeredDomains?.length) {
      throw new Error('Domain configuration is required for root domain stack');
    }

    // Create or import hosted zones for each registered domain
    domainConfig.registeredDomains.forEach((domain: any, index: number) => {
      this.createOrImportHostedZone(domain, index);
    });
  }

  /**
   * Creates a new hosted zone or imports an existing one
   */
  private createOrImportHostedZone(domain: any, index: number): void {
    // Validate domain configuration
    if (!domain.name) {
      throw new Error(`Domain at index ${index} is missing required "name" field`);
    }

    const domainName = domain.name;
    let hostedZone: IHostedZone;

    if (domain.hostedZoneId) {
      // Import existing hosted zone
      hostedZone = HostedZone.fromHostedZoneAttributes(this, `HostedZone${index}`, {
        hostedZoneId: domain.hostedZoneId,
        zoneName: domainName,
      });

      // Add output for imported zone
      new CfnOutput(this, `${this.sanitizeDomainName(domainName)}ImportedZoneId`, {
        value: domain.hostedZoneId,
        description: `Imported hosted zone ID for ${domainName}`,
        exportName: this.naming.exportName(`${this.sanitizeDomainName(domainName)}-hosted-zone-id`),
      });
    } else {
      // Create new hosted zone using construct
      const stackConfig = this.getStackConfig();
      const hostedZoneConstruct = new Route53HostedZoneConstruct(this, `HostedZone${index}`, {
        naming: this.naming,
        environment: stackConfig.environment,
        company: stackConfig.company,
        project: stackConfig.project,
        owner: stackConfig.owner,
        domainName,
        comment: `Hosted zone for ${domainName} - managed by ${stackConfig.project}`,
      });

      hostedZone = hostedZoneConstruct.hostedZone;

      // Export hosted zone ID
      new CfnOutput(this, `${this.sanitizeDomainName(domainName)}HostedZoneId`, {
        value: hostedZone.hostedZoneId,
        description: `Hosted zone ID for ${domainName}`,
        exportName: this.naming.exportName(`${this.sanitizeDomainName(domainName)}-hosted-zone-id`),
      });

      // Export name servers (use Fn.join for token list)
      new CfnOutput(this, `${this.sanitizeDomainName(domainName)}NameServers`, {
        value: Fn.join(',', hostedZone.hostedZoneNameServers || []),
        description: `Name servers for ${domainName}`,
        exportName: this.naming.exportName(`${this.sanitizeDomainName(domainName)}-name-servers`),
      });
    }

    // Store hosted zone for potential use by other methods
    this.hostedZones.set(domainName, hostedZone);

    // Export hosted zone name for reference
    new CfnOutput(this, `${this.sanitizeDomainName(domainName)}ZoneName`, {
      value: domainName,
      description: `Zone name for ${domainName}`,
      exportName: this.naming.exportName(`${this.sanitizeDomainName(domainName)}-zone-name`),
    });
  }

  /**
   * Sanitizes domain name for use in CloudFormation logical IDs
   * Replaces dots with dashes and capitalizes first letter of each segment
   */
  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }

  /**
   * Gets a hosted zone by domain name
   */
  public getHostedZone(domainName: string): IHostedZone | undefined {
    return this.hostedZones.get(domainName);
  }

  /**
   * Gets all hosted zones
   */
  public getAllHostedZones(): Map<string, IHostedZone> {
    return this.hostedZones;
  }
}
