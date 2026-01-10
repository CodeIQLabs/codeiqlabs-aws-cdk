/**
 * Origin Domain Stack for Customization
 *
 * Creates a predictable Route53 A record (origin-{env}.codeiqlabs.com) that points to the ALB.
 * This enables CloudFront to use predictable origin domains without SSM parameter lookups,
 * solving the chicken-and-egg deployment issue.
 *
 * Architecture:
 * - CloudFront uses predictable domain: origin-nprd.codeiqlabs.com (hardcoded)
 * - Route53 A record (Alias): origin-nprd.codeiqlabs.com → ALB DNS
 * - No SSM lookups needed at synthesis time
 * - No cross-account token issues
 *
 * This stack is deployed by customization-aws to workload accounts.
 */

import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Props for OriginDomainStack
 */
export interface OriginDomainStackProps extends BaseStackProps {
  /** Application Load Balancer to point the origin domain to */
  alb: elbv2.IApplicationLoadBalancer;
  /** Environment name (e.g., 'nprd', 'prod') - used to generate origin domain */
  environment: string;
  /** Hosted Zone ID for codeiqlabs.com (from management account) */
  hostedZoneId: string;
  /** Hosted Zone name (e.g., 'codeiqlabs.com') */
  hostedZoneName: string;
}

/**
 * Origin Domain Stack
 *
 * Creates a Route53 A record that provides a predictable origin domain for CloudFront.
 */
export class OriginDomainStack extends BaseStack {
  /** The origin domain created (e.g., origin-nprd.codeiqlabs.com) */
  public readonly originDomain: string;

  constructor(scope: Construct, id: string, props: OriginDomainStackProps) {
    super(scope, id, 'OriginDomain', props);

    // Reference codeiqlabs.com hosted zone from management account
    // Using fromHostedZoneAttributes to avoid cross-account lookup issues
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'CodeIQLabsZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });

    // Create predictable origin domain: origin-{env}.codeiqlabs.com
    this.originDomain = `origin-${props.environment}.codeiqlabs.com`;

    // Create Route53 A record (Alias to ALB)
    // Alias records are free and automatically update if ALB IPs change
    new route53.ARecord(this, 'OriginARecord', {
      zone: hostedZone,
      recordName: this.originDomain,
      target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(props.alb)),
      comment: `Origin domain for CloudFront → ALB (${props.environment})`,
    });

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'OriginDomain', {
      value: this.originDomain,
      description: `Origin domain for CloudFront distributions (${props.environment})`,
      exportName: this.naming.exportName('origin-domain'),
    });

    new cdk.CfnOutput(this, 'OriginDomainAlbArn', {
      value: props.alb.loadBalancerArn,
      description: 'ALB ARN that origin domain points to',
      exportName: this.naming.exportName('origin-domain-alb-arn'),
    });
  }
}
