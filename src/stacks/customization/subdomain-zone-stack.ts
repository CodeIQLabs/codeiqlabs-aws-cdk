import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as iam from 'aws-cdk-lib/aws-iam';
import { BaseStack, type BaseStackProps } from '../base/base-stack';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Subdomain Zone Stack
 *
 * Creates delegated subdomain zones in workload accounts with cross-account NS delegation.
 *
 * **Architecture:**
 * - Deployed in Workload Accounts (NonProd/Prod)
 * - Creates subdomain hosted zones (e.g., nprd.savvue.com, prod.savvue.com)
 * - Uses CrossAccountZoneDelegationRecord to auto-create NS records in parent zone
 *
 * **Example for NonProd:**
 * - Creates zone: nprd.savvue.com
 * - Assumes role: Route53-Delegation-savvue-com (in management account)
 * - Creates NS record in savvue.com zone → delegates nprd.savvue.com
 *
 * **Deployment Order:**
 * 1. Management: RootDomainStack (creates parent zones + delegation roles)
 * 2. Workload: SubdomainZoneStack (creates subdomain zones + delegation)
 * 3. Workload: InfraAlbStack (creates ALB + certificates + HTTPS listener)
 * 4. Workload: AlbDnsRecordStack (creates A records pointing to ALB)
 *
 * **Manifest Configuration:**
 * ```yaml
 * domains:
 *   registeredDomains:
 *     - name: "savvue.com"
 *       createDelegationRole: true
 *       allowedEnvironments: [nprd, prod]
 * saasEdge:
 *   - domain: savvue.com
 *     distributions: [...]
 * ```
 */

export interface SubdomainZoneStackProps extends BaseStackProps {
  /** Unified application configuration from manifest */
  config: UnifiedAppConfig;
  /** Management account ID (where parent zones live) */
  managementAccountId: string;
}

/**
 * Subdomain Zone Stack implementation
 */
export class SubdomainZoneStack extends BaseStack {
  /** Map of subdomain zones created (domain → zone) */
  public readonly subdomainZones: Map<string, route53.IHostedZone> = new Map();
  /** List of brand domains processed */
  public readonly brandDomains: string[] = [];
  /** Stack props */
  private readonly props: SubdomainZoneStackProps;

  constructor(scope: Construct, id: string, props: SubdomainZoneStackProps) {
    super(scope, id, 'SubdomainZone', props);
    this.props = props;

    const stackConfig = this.getStackConfig();
    const environment = stackConfig.environment;

    // Derive brand domains from saasEdge
    // Exclude domains that only have 'marketing' distributions (no webapp/api)
    // These don't need subdomain delegation since they use S3 origins directly
    const saasEdge = (props.config as any).saasEdge as any[] | undefined;
    if (!saasEdge) {
      throw new Error('No saasEdge configuration found in manifest');
    }

    const brandDomains = saasEdge
      .filter((edge) => {
        // Check if this domain has any non-marketing distributions
        const distributions = edge.distributions as { type: string }[] | undefined;
        if (!distributions || distributions.length === 0) return false;
        // Include domain if it has webapp or api distributions (needs subdomain delegation)
        return distributions.some((d) => d.type === 'webapp' || d.type === 'api');
      })
      .map((edge) => edge.domain);

    if (brandDomains.length === 0) {
      // No brand domains to process, skip stack creation
      return;
    }

    this.brandDomains = brandDomains;

    // Create subdomain zone for each brand domain
    brandDomains.forEach((parentDomain, index) => {
      this.createSubdomainZone(parentDomain, environment, index);
    });
  }

  /**
   * Creates a subdomain zone with cross-account delegation
   */
  private createSubdomainZone(parentDomain: string, environment: string, index: number): void {
    const subdomainZoneName = `${environment}.${parentDomain}`; // nprd.savvue.com

    // Create subdomain hosted zone
    const hostedZone = new route53.PublicHostedZone(this, `Zone${index}`, {
      zoneName: subdomainZoneName,
      comment: `Subdomain zone for ${parentDomain} ${environment} - managed by CDK`,
    });

    this.subdomainZones.set(parentDomain, hostedZone);

    // Construct delegation role ARN using predictable naming pattern
    // Role name: Route53-Delegation-savvue-com (for savvue.com)
    const roleName = `Route53-Delegation-${parentDomain.replace(/\./g, '-')}`;
    const delegationRoleArn = `arn:aws:iam::${this.props.managementAccountId}:role/${roleName}`;

    const delegationRole = iam.Role.fromRoleArn(this, `DelegationRole${index}`, delegationRoleArn);

    // Create cross-account NS delegation record in parent zone
    new route53.CrossAccountZoneDelegationRecord(this, `Delegation${index}`, {
      delegatedZone: hostedZone,
      parentHostedZoneName: parentDomain,
      delegationRole,
      ttl: cdk.Duration.hours(1),
    });

    // Outputs
    new cdk.CfnOutput(this, `${this.sanitizeDomainName(parentDomain)}SubdomainZone`, {
      value: subdomainZoneName,
      description: `Subdomain zone for ${parentDomain}`,
    });

    new cdk.CfnOutput(this, `${this.sanitizeDomainName(parentDomain)}SubdomainZoneId`, {
      value: hostedZone.hostedZoneId,
      description: `Hosted zone ID for ${subdomainZoneName}`,
      exportName: this.naming.exportName(`${this.sanitizeDomainName(parentDomain)}-zone-id`),
    });
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
