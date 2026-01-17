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
  /** Allowed IP CIDRs for nprd WAF (optional) */
  nprdAllowedCidrs?: string[];
}

/**
 * ACM + WAF Stack
 *
 * Creates CloudFront certificates and WAF Web ACLs.
 * Domains are derived from saasApps (convention-over-configuration).
 *
 * Certificates: Combined apex + wildcard per domain (e.g., savvue.com + *.savvue.com)
 * WAF: Environment-wide ACLs (prod = open, nprd = IP-restricted)
 */
export class AcmAndWafStack extends BaseStack {
  /** WAF Web ACL ARN for prod CloudFront distributions (open access) */
  public readonly prodWebAclArn: string;
  /** WAF Web ACL ARN for nprd CloudFront distributions (IP-restricted) */
  public readonly nprdWebAclArn: string;

  constructor(scope: Construct, id: string, props: AcmAndWafStackProps) {
    super(scope, id, 'AcmAndWaf', props);

    if (props.stackConfig.region !== 'us-east-1') {
      throw new Error('AcmAndWafStack must be deployed in us-east-1 for CloudFront');
    }

    // Derive domains from saasEdge or use explicit registeredDomains
    const saasEdge = (props.config as any).saasEdge as any[] | undefined;
    const domainConfig = (props.config as any).domains;

    // Build unique domain list
    const domainMap = new Map<string, { name: string; hostedZoneId?: string }>();

    if (saasEdge) {
      for (const app of saasEdge) {
        if (!domainMap.has(app.domain)) {
          domainMap.set(app.domain, { name: app.domain });
        }
      }
    }

    if (domainConfig?.registeredDomains) {
      for (const domain of domainConfig.registeredDomains) {
        domainMap.set(domain.name, domain);
      }
    }

    if (domainMap.size === 0) {
      throw new Error(
        'No domains found. Provide saasEdge or domains.registeredDomains in manifest.',
      );
    }

    // 1) Certificates per domain
    let domainIndex = 0;
    for (const domain of domainMap.values()) {
      const hostedZone = this.importHostedZone(domain, domainIndex);
      this.createCertificates(hostedZone, domainIndex);
      domainIndex++;
    }

    // 2) Environment-wide WAF Web ACLs (prod + nprd)
    const { prodWebAclArn, nprdWebAclArn } = this.createWafWebAcls(props.nprdAllowedCidrs || []);
    this.prodWebAclArn = prodWebAclArn;
    this.nprdWebAclArn = nprdWebAclArn;
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
   * @returns Object containing prodWebAclArn and nprdWebAclArn
   */
  private createWafWebAcls(nprdAllowedIpCidrs: string[]): {
    prodWebAclArn: string;
    nprdWebAclArn: string;
  } {
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

    // Custom response body key for WAF block responses
    // Using 499 status code to avoid CloudFront's customErrorResponses catching 403
    // (CloudFront converts 403/404 to 200 for SPA routing, which would bypass WAF blocks)
    const customResponseBodyKey = 'nprd-access-denied';

    const nprdWebAcl = new wafv2.CfnWebACL(this, 'NprdWebAcl', {
      scope: 'CLOUDFRONT',
      defaultAction: {
        block: {
          customResponse: {
            responseCode: 499,
            customResponseBodyKey,
          },
        },
      },
      customResponseBodies: {
        [customResponseBodyKey]: {
          contentType: 'TEXT_HTML',
          content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Denied</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; }
    h1 { color: #e74c3c; margin-bottom: 1rem; }
    p { color: #666; margin-bottom: 0.5rem; }
    .code { font-family: monospace; background: #f0f0f0; padding: 0.25rem 0.5rem; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Access Denied</h1>
    <p>This environment is restricted to authorized IP addresses.</p>
    <p>If you believe this is an error, please contact the administrator.</p>
    <p class="code">Error: NPRD-WAF-BLOCK</p>
  </div>
</body>
</html>`,
        },
      },
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

    return {
      prodWebAclArn: prodWebAcl.attrArn,
      nprdWebAclArn: nprdWebAcl.attrArn,
    };
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
