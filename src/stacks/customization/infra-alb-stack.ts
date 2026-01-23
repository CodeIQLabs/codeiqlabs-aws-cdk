/**
 * Infrastructure ALB Stack for Customization
 *
 * Creates an Application Load Balancer with HTTPS listener and ACM certificates.
 * Creates a single SAN certificate covering all alb.{env}.{domain} patterns
 * (e.g., alb.nprd.savvue.com, alb.nprd.timisly.com, etc.) to ensure CloudFront
 * can connect to any origin domain without SNI issues.
 *
 * This stack is deployed by customization-aws and consumed by saas-aws.
 */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * ALB configuration options
 */
export interface InfraAlbConfig {
  /**
   * Whether the ALB is internal (private) or internet-facing
   * @default true (internal for VPC Origins)
   */
  internal?: boolean;
}

/**
 * Props for InfraAlbStack
 */
export interface InfraAlbStackProps extends BaseStackProps {
  vpc: ec2.IVpc;
  albSecurityGroup: ec2.ISecurityGroup;
  albConfig?: InfraAlbConfig;
  /** Brand domains for certificate creation (e.g., ['savvue.com', 'timisly.com']) */
  brandDomains?: string[];
  /** Subdomain hosted zones for DNS validation (domain → zone) */
  subdomainZones?: Map<string, route53.IHostedZone>;
}

/**
 * Infrastructure ALB Stack
 *
 * Creates an ALB with HTTPS listener and a single SAN certificate for CloudFront origins.
 * The SAN certificate covers all alb.{env}.{domain} patterns to ensure CloudFront
 * can connect to any origin without SNI-related certificate mismatch issues.
 */
export class InfraAlbStack extends BaseStack {
  public readonly alb: elbv2.IApplicationLoadBalancer;
  public readonly httpsListener?: elbv2.IApplicationListener;
  public readonly sanCertificate?: certificatemanager.ICertificate;

  constructor(scope: Construct, id: string, props: InfraAlbStackProps) {
    super(scope, id, 'Alb', props);

    const config = props.albConfig ?? {};
    const internal = config.internal ?? true;
    const stackConfig = this.getStackConfig();
    const environment = stackConfig.environment;

    // Create ALB
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: this.naming.resourceName('alb'),
      vpc: props.vpc,
      internetFacing: !internal,
      securityGroup: props.albSecurityGroup,
      vpcSubnets: {
        subnetType: internal ? ec2.SubnetType.PRIVATE_WITH_EGRESS : ec2.SubnetType.PUBLIC,
      },
    });

    // Create SAN certificate and HTTPS listener if brand domains are provided
    if (props.brandDomains && props.brandDomains.length > 0 && props.subdomainZones) {
      // Build list of all ALB origin domain names
      const albDomainNames = props.brandDomains.map((domain) => `alb.${environment}.${domain}`);

      // Build domain-to-zone mapping for multi-zone DNS validation
      const hostedZones: { [domainName: string]: route53.IHostedZone } = {};
      props.brandDomains.forEach((domain) => {
        const subdomainZone = props.subdomainZones!.get(domain);
        if (!subdomainZone) {
          throw new Error(`Subdomain zone not found for domain: ${domain}`);
        }
        const albDomainName = `alb.${environment}.${domain}`;
        hostedZones[albDomainName] = subdomainZone;
      });

      // Create a single SAN certificate covering all ALB origin domains
      // This ensures CloudFront can connect to any origin without SNI issues
      // because the default certificate will match all origin domains
      const primaryDomain = albDomainNames[0];
      const sanDomains = albDomainNames.slice(1);

      this.sanCertificate = new certificatemanager.Certificate(this, 'AlbSanCert', {
        domainName: primaryDomain,
        subjectAlternativeNames: sanDomains.length > 0 ? sanDomains : undefined,
        validation: certificatemanager.CertificateValidation.fromDnsMultiZone(hostedZones),
      });

      // Output SAN certificate ARN
      new cdk.CfnOutput(this, 'AlbSanCertificateArn', {
        value: this.sanCertificate.certificateArn,
        description: `SAN certificate ARN covering all ALB origin domains: ${albDomainNames.join(', ')}`,
        exportName: this.naming.exportName('alb-san-cert-arn'),
      });

      // Create HTTPS listener with the SAN certificate as default
      this.httpsListener = this.alb.addListener('HttpsListener', {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [this.sanCertificate],
        defaultAction: elbv2.ListenerAction.fixedResponse(404, {
          contentType: 'text/plain',
          messageBody: 'Not Found - ALB HTTPS Listener',
        }),
      });

      // Export HTTPS listener ARN
      new ssm.StringParameter(this, 'SsmHttpsListenerArn', {
        parameterName: this.naming.ssmParameterName('alb', 'https-listener-arn'),
        stringValue: this.httpsListener.listenerArn,
        description: `HTTPS Listener ARN for ${environment} environment`,
      });

      new cdk.CfnOutput(this, 'HttpsListenerArn', {
        value: this.httpsListener.listenerArn,
        exportName: this.naming.exportName('https-listener-arn'),
        description: 'HTTPS Listener ARN',
      });
    }

    // Export via SSM
    new ssm.StringParameter(this, 'SsmAlbArn', {
      parameterName: this.naming.ssmParameterName('alb', 'arn'),
      stringValue: this.alb.loadBalancerArn,
      description: `ALB ARN for ${environment} environment`,
    });
    new ssm.StringParameter(this, 'SsmAlbDnsName', {
      parameterName: this.naming.ssmParameterName('alb', 'dns-name'),
      stringValue: this.alb.loadBalancerDnsName,
      description: `ALB DNS name for ${environment} environment`,
    });
    new ssm.StringParameter(this, 'SsmAlbCanonicalHostedZoneId', {
      parameterName: this.naming.ssmParameterName('alb', 'canonical-hosted-zone-id'),
      stringValue: this.alb.loadBalancerCanonicalHostedZoneId,
      description: `ALB canonical hosted zone ID for ${environment} environment`,
    });

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'AlbArn', {
      value: this.alb.loadBalancerArn,
      exportName: this.naming.exportName('alb-arn'),
      description: 'ALB ARN',
    });
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      exportName: this.naming.exportName('alb-dns'),
      description: 'ALB DNS Name',
    });
  }
}
