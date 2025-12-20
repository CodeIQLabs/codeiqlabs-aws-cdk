import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { BaseStack, type BaseStackProps } from '../base/base-stack';

/**
 * Origin Hosted Zone Stack
 *
 * Creates Route53 hosted zones for origin sub-domains in workload accounts.
 * These zones contain Alias A records pointing to ALBs.
 *
 * **Architecture:**
 * - Workload account owns: origin-{env}.{brand} hosted zone
 * - Creates Alias A records: {service}.origin-{env}.{brand} → ALB
 * - Exports NS values for management account to create NS delegation
 *
 * **Benefits:**
 * - ALB is in same account as hosted zone (easy Alias records)
 * - No cross-account lookups needed
 * - ALB replacement automatically updates Alias records
 *
 * **Example:**
 * - Zone: origin-prod.savvue.com
 * - Records:
 *   - webapp.origin-prod.savvue.com → Alias → prod-webapp-alb...elb.amazonaws.com
 *   - api.origin-prod.savvue.com → Alias → prod-api-alb...elb.amazonaws.com
 */

export interface OriginHostedZoneConfig {
  /** Brand domains to create origin zones for (e.g., ['savvue.com', 'timisly.com']) */
  brands: string[];
  /** Services to create Alias records for */
  services: {
    /** Service name (e.g., 'webapp', 'api') */
    name: string;
    /** ALB to point to - either the ALB object or its ARN */
    alb?: elbv2.IApplicationLoadBalancer;
    /** Alternative: ALB ARN to import */
    albArn?: string;
  }[];
}

export interface OriginHostedZoneStackProps extends BaseStackProps {
  /** Origin zone configuration */
  originConfig: OriginHostedZoneConfig;
}

export class OriginHostedZoneStack extends BaseStack {
  /** Map of zone names to hosted zones */
  public readonly hostedZones: Map<string, route53.IHostedZone> = new Map();

  constructor(scope: Construct, id: string, props: OriginHostedZoneStackProps) {
    super(scope, id, 'OriginHostedZone', props);

    const { originConfig } = props;
    const env = this.getStackConfig().environment;

    // Create a hosted zone for each brand
    originConfig.brands.forEach((brand, brandIndex) => {
      const zoneName = `origin-${env}.${brand}`;

      // Create the hosted zone
      const hostedZone = new route53.HostedZone(this, `Zone${brandIndex}`, {
        zoneName,
        comment: `Origin zone for ${brand} ${env} - managed by CDK`,
      });

      this.hostedZones.set(zoneName, hostedZone);

      // Export NS values for management account to create delegation
      const sanitizedZone = this.sanitizeDomainName(zoneName);
      new cdk.CfnOutput(this, `${sanitizedZone}NameServers`, {
        value: cdk.Fn.join(',', hostedZone.hostedZoneNameServers || []),
        description: `NS values for ${zoneName} - add to management manifest`,
        exportName: this.naming.exportName(`${sanitizedZone}-ns`),
      });

      new cdk.CfnOutput(this, `${sanitizedZone}ZoneId`, {
        value: hostedZone.hostedZoneId,
        description: `Hosted zone ID for ${zoneName}`,
        exportName: this.naming.exportName(`${sanitizedZone}-zone-id`),
      });

      // Store NS values in SSM for easy retrieval
      new ssm.StringParameter(this, `${sanitizedZone}NsParam`, {
        parameterName: this.naming.ssmParameterName('origin-zone', `${brand}-ns`),
        stringValue: cdk.Fn.join(',', hostedZone.hostedZoneNameServers || []),
        description: `NS values for ${zoneName}`,
        tier: ssm.ParameterTier.STANDARD,
      });

      // Create Alias A records for each service
      originConfig.services.forEach((service, serviceIndex) => {
        if (service.alb) {
          this.createAliasRecord(hostedZone, service.name, service.alb, brandIndex, serviceIndex);
        }
      });
    });
  }

  private createAliasRecord(
    hostedZone: route53.IHostedZone,
    serviceName: string,
    alb: elbv2.IApplicationLoadBalancer,
    brandIndex: number,
    serviceIndex: number,
  ): void {
    new route53.ARecord(this, `Alias${brandIndex}${serviceIndex}`, {
      zone: hostedZone,
      recordName: serviceName,
      target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb)),
      comment: `Alias to ${serviceName} ALB`,
    });
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
