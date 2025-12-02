import { Construct } from 'constructs';
import { CfnOutput, Fn } from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { BaseStack, type BaseStackProps } from '../base/base-stack';
import { AcmCertificateConstruct } from '../../constructs/acm/constructs';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

export interface AcmAndWafStackProps extends BaseStackProps {
  /** Unified application configuration from manifest */
  config: UnifiedAppConfig;
}

/**
 * ACM + WAF Stack (Stage 1)
 *
 * Owns all CloudFront certificates and WAF Web ACLs that are independent of
 * workload ALBs. Certificates and Web ACLs are exported for consumption by
 * the CloudFrontDistributionStack in Stage 2.
 */
export class AcmAndWafStack extends BaseStack {
  constructor(scope: Construct, id: string, props: AcmAndWafStackProps) {
    super(scope, id, 'AcmAndWaf', props);

    if (props.stackConfig.region !== 'us-east-1') {
      throw new Error('AcmAndWafStack must be deployed in us-east-1 for CloudFront');
    }

    const domainConfig = (props.config as any).domains;
    if (!domainConfig?.enabled || !domainConfig.registeredDomains?.length) {
      throw new Error('Domain configuration is required for AcmAndWafStack');
    }

    // 1) Certificates per registered domain
    domainConfig.registeredDomains.forEach((domain: any, domainIndex: number) => {
      if (!domain.name) {
        throw new Error(`Domain at index ${domainIndex} is missing required "name" field`);
      }

      const hostedZone = this.importHostedZone(domain, domainIndex);
      this.createCertificates(hostedZone, domainIndex);
    });

    // 2) Environment-wide WAF Web ACLs (prod + nprd)
    this.createWafWebAcls(domainConfig);
  }

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
   * Create a combined certificate with apex + wildcard SANs for CloudFront.
   * CloudFront requires a single certificate that covers ALL alternate domain names.
   */
  private createCertificates(hostedZone: IHostedZone, domainIndex: number): void {
    const stackConfig = this.getStackConfig();
    const domainName = hostedZone.zoneName;
    const baseDomain = domainName.endsWith('.') ? domainName.slice(0, -1) : domainName;

    // Combined certificate with apex as primary and wildcard as SAN
    // This covers both domain.com AND *.domain.com
    const combinedCertConstruct = new AcmCertificateConstruct(
      this,
      `CombinedCertificate${domainIndex}`,
      {
        naming: this.naming,
        environment: stackConfig.environment,
        company: stackConfig.company,
        project: stackConfig.project,
        owner: stackConfig.owner,
        domainName: baseDomain,
        subjectAlternativeNames: [`*.${baseDomain}`],
        hostedZone,
        certificateType: 'combined',
      },
    );

    const combinedCert = combinedCertConstruct.certificate;

    // Export as wildcard cert ARN (for backwards compatibility with CloudFront stack)
    // This certificate covers BOTH apex and wildcard domains
    new CfnOutput(this, `${this.sanitizeDomainName(baseDomain)}WildcardCertificateArn`, {
      value: combinedCert.certificateArn,
      description: `Combined ACM certificate ARN for ${baseDomain} and *.${baseDomain}`,
      exportName: this.naming.exportName(
        `${this.sanitizeDomainName(baseDomain)}-wildcard-cert-arn`,
      ),
    });

    // Also export as apex cert ARN (for backwards compatibility)
    new CfnOutput(this, `${this.sanitizeDomainName(baseDomain)}ApexCertificateArn`, {
      value: combinedCert.certificateArn,
      description: `Combined ACM certificate ARN for ${baseDomain} and *.${baseDomain}`,
      exportName: this.naming.exportName(`${this.sanitizeDomainName(baseDomain)}-apex-cert-arn`),
    });
  }

  /**
   * Create environment-wide WAF Web ACLs for prod and nprd and export their ARNs.
   */
  private createWafWebAcls(domainConfig: any): void {
    // Build environment-wide allowed CIDRs for nprd from manifest
    const allNprdCidrs = new Set<string>();

    for (const domain of domainConfig.registeredDomains ?? []) {
      for (const sub of domain.subdomains ?? []) {
        const cf = sub.cloudfront;
        const w = cf?.wafConfig;
        if (cf?.wafEnabled && w?.profile === 'nprd') {
          for (const cidr of w.allowedIpCidrs ?? []) {
            allNprdCidrs.add(cidr);
          }
        }
      }
    }

    const nprdAllowedIpCidrs = Array.from(allNprdCidrs);

    // Prod Web ACL (open, can add managed rules later)
    const prodWebAcl = new wafv2.CfnWebACL(this, 'ProdWebAcl', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'prod-web-acl',
        sampledRequestsEnabled: true,
      },
      rules: [],
    });

    new CfnOutput(this, 'ProdWebAclArn', {
      value: prodWebAcl.attrArn,
      description: 'WAF Web ACL ARN for prod CloudFront distributions',
      exportName: this.naming.exportName('prod-web-acl-arn'),
    });

    // Nprd IP set and Web ACL (only allow nprdAllowedIpCidrs)
    const nprdIpSet = new wafv2.CfnIPSet(this, 'NprdAllowedIps', {
      addresses: nprdAllowedIpCidrs,
      ipAddressVersion: 'IPV4',
      scope: 'CLOUDFRONT',
      name: 'nprd-allowed-ips',
    });

    const nprdWebAcl = new wafv2.CfnWebACL(this, 'NprdWebAcl', {
      scope: 'CLOUDFRONT',
      defaultAction: { block: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'nprd-web-acl',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AllowAllowedCidrs',
          priority: 1,
          action: { allow: {} },
          statement: {
            ipSetReferenceStatement: { arn: nprdIpSet.attrArn },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'nprd-allowed-cidrs',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new CfnOutput(this, 'NprdWebAclArn', {
      value: nprdWebAcl.attrArn,
      description: 'WAF Web ACL ARN for nprd CloudFront distributions',
      exportName: this.naming.exportName('nprd-web-acl-arn'),
    });
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
