/**
 * API Gateway Domain Stack
 *
 * Creates API Gateway custom domains with ACM certificates and DNS records.
 * This stack is deployed in customization-aws BEFORE saas-aws, enabling
 * single-pass deployment flow.
 *
 * **Key Design:**
 * - Creates DomainName WITHOUT ApiMapping (ApiMapping requires HTTP API)
 * - Exports DomainName ARN via SSM for saas-aws to create ApiMapping
 * - Creates A records pointing to API Gateway regional domain
 *
 * **Architecture:**
 * - SAN certificate covers all api-gw.{env}.{brand}.com domains
 * - API Gateway DomainName uses the certificate
 * - Route53 A record points to API Gateway regional domain
 * - SSM parameters export domain info for saas-aws
 *
 * **Deployment Order:**
 * 1. customization-aws: SubdomainZoneStack -> ApiGatewayDomainStack -> CloudFront
 * 2. saas-aws: LambdaStack -> ApiGatewayStack (creates ApiMapping using SSM lookup)
 */

import * as cdk from 'aws-cdk-lib';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Props for ApiGatewayDomainStack
 */
export interface ApiGatewayDomainStackProps extends BaseStackProps {
  /** Brand domains for certificate creation (e.g., ['savvue.com', 'equitrio.com']) */
  brandDomains: string[];
  /** Subdomain hosted zones (domain -> zone) - passed from SubdomainZoneStack */
  subdomainZones: Map<string, route53.IHostedZone>;
}

/**
 * API Gateway Domain Stack
 *
 * Creates API Gateway custom domains with certificates and DNS records.
 * Does NOT create ApiMapping - that's done by saas-aws ApiGatewayStack.
 */
export class ApiGatewayDomainStack extends BaseStack {
  public readonly sanCertificate: certificatemanager.ICertificate;
  public readonly customDomains: Map<string, apigatewayv2.DomainName> = new Map();

  constructor(scope: Construct, id: string, props: ApiGatewayDomainStackProps) {
    super(scope, id, 'ApiGwDomain', props);

    const stackConfig = this.getStackConfig();
    const environment = stackConfig.environment;

    if (props.brandDomains.length === 0) {
      throw new Error('At least one brand domain is required');
    }

    // Build list of all API Gateway origin domain names
    const apiGwDomainNames = props.brandDomains.map((domain) => `api-gw.${environment}.${domain}`);

    // Build domain-to-zone mapping for multi-zone DNS validation
    const hostedZones: { [domainName: string]: route53.IHostedZone } = {};
    props.brandDomains.forEach((domain) => {
      const subdomainZone = props.subdomainZones.get(domain);
      if (!subdomainZone) {
        throw new Error(`Subdomain zone not found for domain: ${domain}`);
      }
      const apiGwDomainName = `api-gw.${environment}.${domain}`;
      hostedZones[apiGwDomainName] = subdomainZone;
    });

    // Create a single SAN certificate covering all API Gateway origin domains
    const primaryDomain = apiGwDomainNames[0];
    const sanDomains = apiGwDomainNames.slice(1);

    this.sanCertificate = new certificatemanager.Certificate(this, 'ApiGwSanCert', {
      domainName: primaryDomain,
      subjectAlternativeNames: sanDomains.length > 0 ? sanDomains : undefined,
      validation: certificatemanager.CertificateValidation.fromDnsMultiZone(hostedZones),
    });

    // SSM prefix for exports
    const ssmPrefix = `/codeiqlabs/saas/${environment}`;

    // Create custom domain for each brand (WITHOUT ApiMapping)
    props.brandDomains.forEach((domain, index) => {
      const apiGwDomainName = `api-gw.${environment}.${domain}`;
      const subdomainZone = props.subdomainZones.get(domain)!;

      // Create API Gateway DomainName
      const customDomain = new apigatewayv2.DomainName(this, `CustomDomain${index}`, {
        domainName: apiGwDomainName,
        certificate: this.sanCertificate,
      });

      this.customDomains.set(domain, customDomain);

      // Create A record pointing to API Gateway regional domain
      new route53.ARecord(this, `ApiGwRecord${index}`, {
        zone: subdomainZone,
        recordName: `api-gw`,
        target: route53.RecordTarget.fromAlias({
          bind: () => ({
            dnsName: customDomain.regionalDomainName,
            hostedZoneId: customDomain.regionalHostedZoneId,
          }),
        }),
        comment: `ALIAS record for ${apiGwDomainName} pointing to API Gateway`,
      });

      // Export DomainName via SSM for saas-aws to create ApiMapping
      const sanitizedDomain = this.sanitizeDomainName(domain);
      new ssm.StringParameter(this, `SsmDomainName${index}`, {
        parameterName: `${ssmPrefix}/api-gateway/${sanitizedDomain}/domain-name`,
        stringValue: customDomain.name,
        description: `API Gateway custom domain name for ${domain}`,
      });

      // Output
      new cdk.CfnOutput(this, `${sanitizedDomain}ApiGwDomain`, {
        value: apiGwDomainName,
        description: `API Gateway custom domain for ${domain}`,
        exportName: this.naming.exportName(`${sanitizedDomain}-api-gw-domain`),
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
