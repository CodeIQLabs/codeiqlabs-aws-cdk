import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { BaseStack, type BaseStackProps } from '../base/base-stack';

/**
 * ALB DNS Record Stack
 *
 * Creates A records pointing ALB domains to the Application Load Balancer.
 * This stack breaks the circular dependency between SubdomainZoneStack and InfraAlbStack.
 *
 * **Dependency Order:**
 * 1. SubdomainZoneStack (creates zones)
 * 2. InfraAlbStack (creates ALB + certificates + HTTPS listener)
 * 3. AlbDnsRecordStack (creates A records pointing to ALB)
 *
 * **Example:**
 * - Creates A record: alb.nprd.savvue.com → ALB
 * - Creates A record: alb.prod.savvue.com → ALB
 */

export interface AlbDnsRecordStackProps extends BaseStackProps {
  /** Application Load Balancer */
  alb: elbv2.IApplicationLoadBalancer;
  /** Subdomain hosted zones (domain → zone) */
  subdomainZones: Map<string, route53.IHostedZone>;
  /** Brand domains to create A records for */
  brandDomains: string[];
}

export class AlbDnsRecordStack extends BaseStack {
  constructor(scope: Construct, id: string, props: AlbDnsRecordStackProps) {
    super(scope, id, 'AlbDnsRecord', props);

    const stackConfig = this.getStackConfig();
    const environment = stackConfig.environment;

    // Create A record for each brand domain
    props.brandDomains.forEach((domain, index) => {
      const subdomainZone = props.subdomainZones.get(domain);
      if (!subdomainZone) {
        throw new Error(`Subdomain zone not found for domain: ${domain}`);
      }

      const albDomainName = `alb.${environment}.${domain}`;

      // Create A record (ALIAS) pointing to ALB
      new route53.ARecord(this, `AlbRecord${index}`, {
        zone: subdomainZone,
        recordName: albDomainName,
        target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(props.alb)),
        comment: `ALIAS record for ${albDomainName} pointing to ALB`,
      });

      // Output
      new cdk.CfnOutput(this, `${this.sanitizeDomainName(domain)}AlbDomain`, {
        value: albDomainName,
        description: `ALB domain for ${domain}`,
        exportName: this.naming.exportName(`${this.sanitizeDomainName(domain)}-alb-domain`),
      });
    });
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
