import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { BaseStack, type BaseStackProps } from '../base/base-stack';

/**
 * API Gateway DNS Record Stack
 *
 * Creates A records pointing API Gateway domains to the API Gateway custom domain.
 * This stack breaks the circular dependency between SubdomainZoneStack and ApiGatewayCustomDomainStack.
 *
 * **Dependency Order:**
 * 1. SubdomainZoneStack (creates zones)
 * 2. ApiGatewayStack (creates HTTP API)
 * 3. ApiGatewayCustomDomainStack (creates certificate + custom domain)
 * 4. ApiGatewayDnsRecordStack (creates A records pointing to API Gateway)
 *
 * **Example:**
 * - Creates A record: api-gw.nprd.savvue.com → API Gateway regional domain
 * - Creates A record: api-gw.prod.savvue.com → API Gateway regional domain
 */

export interface ApiGatewayDnsRecordStackProps extends BaseStackProps {
  /** API Gateway custom domains (domain → DomainName) */
  customDomains: Map<string, apigatewayv2.DomainName>;
  /** Subdomain hosted zones (domain → zone) */
  subdomainZones: Map<string, route53.IHostedZone>;
  /** Brand domains to create A records for */
  brandDomains: string[];
}

export class ApiGatewayDnsRecordStack extends BaseStack {
  constructor(scope: Construct, id: string, props: ApiGatewayDnsRecordStackProps) {
    super(scope, id, 'ApiGwDnsRecord', props);

    const stackConfig = this.getStackConfig();
    const environment = stackConfig.environment;

    // Create A record for each brand domain
    props.brandDomains.forEach((domain, index) => {
      const subdomainZone = props.subdomainZones.get(domain);
      if (!subdomainZone) {
        throw new Error(`Subdomain zone not found for domain: ${domain}`);
      }

      const customDomain = props.customDomains.get(domain);
      if (!customDomain) {
        throw new Error(`Custom domain not found for domain: ${domain}`);
      }

      const apiGwDomainName = `api-gw.${environment}.${domain}`;

      // Create A record (ALIAS) pointing to API Gateway custom domain
      new route53.ARecord(this, `ApiGwRecord${index}`, {
        zone: subdomainZone,
        recordName: apiGwDomainName,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.ApiGatewayv2DomainProperties(
            customDomain.regionalDomainName,
            customDomain.regionalHostedZoneId,
          ),
        ),
        comment: `ALIAS record for ${apiGwDomainName} pointing to API Gateway`,
      });

      // Output
      new cdk.CfnOutput(this, `${this.sanitizeDomainName(domain)}ApiGwDomain`, {
        value: apiGwDomainName,
        description: `API Gateway domain for ${domain}`,
        exportName: this.naming.exportName(`${this.sanitizeDomainName(domain)}-api-gw-dns`),
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
