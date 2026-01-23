/**
 * API Gateway Custom Domain Stack
 *
 * Creates a custom domain for API Gateway with ACM certificate.
 * Creates a single SAN certificate covering all api-gw.{env}.{domain} patterns
 * (e.g., api-gw.nprd.savvue.com, api-gw.nprd.timisly.com, etc.) to ensure CloudFront
 * can connect to any origin domain without SNI issues.
 *
 * This follows the same pattern as InfraAlbStack for ALB certificates.
 *
 * **Architecture:**
 * - SAN certificate covers all api-gw.{env}.{brand}.com domains
 * - API Gateway custom domain uses the certificate
 * - API mapping connects custom domain to HTTP API
 * - Route53 A record points to API Gateway regional domain
 *
 * **Deployment Order:**
 * 1. SubdomainZoneStack (creates zones)
 * 2. ApiGatewayStack (creates HTTP API)
 * 3. ApiGatewayCustomDomainStack (creates certificate + custom domain)
 * 4. ApiGatewayDnsRecordStack (creates A records pointing to API Gateway)
 */

import * as cdk from 'aws-cdk-lib';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Props for ApiGatewayCustomDomainStack
 */
export interface ApiGatewayCustomDomainStackProps extends BaseStackProps {
  /** HTTP API to attach custom domain to */
  httpApi: apigatewayv2.IHttpApi;
  /** Brand domains for certificate creation (e.g., ['savvue.com', 'timisly.com']) */
  brandDomains: string[];
}

/**
 * API Gateway Custom Domain Stack
 *
 * Creates a custom domain for API Gateway with a single SAN certificate
 * covering all api-gw.{env}.{brand}.com domains.
 */
export class ApiGatewayCustomDomainStack extends BaseStack {
  public readonly sanCertificate: certificatemanager.ICertificate;
  public readonly customDomains: Map<string, apigatewayv2.DomainName> = new Map();
  /** Subdomain zones looked up for DNS validation (domain → zone) */
  public readonly subdomainZones: Map<string, route53.IHostedZone>;
  /** Regional domain name for Route53 A record target */
  public readonly regionalDomainName: string;
  /** Regional hosted zone ID for Route53 A record target */
  public readonly regionalHostedZoneId: string;

  constructor(scope: Construct, id: string, props: ApiGatewayCustomDomainStackProps) {
    super(scope, id, 'ApiGwCustomDomain', props);

    const stackConfig = this.getStackConfig();
    const environment = stackConfig.environment;

    if (props.brandDomains.length === 0) {
      throw new Error('At least one brand domain is required');
    }

    // Build list of all API Gateway origin domain names
    const apiGwDomainNames = props.brandDomains.map((domain) => `api-gw.${environment}.${domain}`);

    // Look up subdomain zones and build domain-to-zone mapping for multi-zone DNS validation
    // The subdomain zones are created by customization-aws SubdomainZoneStack
    // Example: nprd.savvue.com zone for api-gw.nprd.savvue.com certificate validation
    const hostedZones: { [domainName: string]: route53.IHostedZone } = {};
    const subdomainZones = new Map<string, route53.IHostedZone>();

    props.brandDomains.forEach((domain, index) => {
      const subdomainZoneName = `${environment}.${domain}`;
      // Look up the subdomain zone within this stack's scope
      const subdomainZone = route53.HostedZone.fromLookup(this, `SubdomainZone${index}`, {
        domainName: subdomainZoneName,
      });
      subdomainZones.set(domain, subdomainZone);

      const apiGwDomainName = `api-gw.${environment}.${domain}`;
      hostedZones[apiGwDomainName] = subdomainZone;
    });

    // Store subdomain zones for use by ApiGatewayDnsRecordStack
    this.subdomainZones = subdomainZones;

    // Create a single SAN certificate covering all API Gateway origin domains
    const primaryDomain = apiGwDomainNames[0];
    const sanDomains = apiGwDomainNames.slice(1);

    this.sanCertificate = new certificatemanager.Certificate(this, 'ApiGwSanCert', {
      domainName: primaryDomain,
      subjectAlternativeNames: sanDomains.length > 0 ? sanDomains : undefined,
      validation: certificatemanager.CertificateValidation.fromDnsMultiZone(hostedZones),
    });

    // Output SAN certificate ARN
    new cdk.CfnOutput(this, 'ApiGwSanCertificateArn', {
      value: this.sanCertificate.certificateArn,
      description: `SAN certificate ARN covering all API Gateway origin domains: ${apiGwDomainNames.join(', ')}`,
      exportName: this.naming.exportName('api-gw-san-cert-arn'),
    });

    // Create custom domain for each brand
    // Note: We create one custom domain per brand, all using the same SAN certificate
    let firstDomain: apigatewayv2.DomainName | undefined;

    props.brandDomains.forEach((domain, index) => {
      const apiGwDomainName = `api-gw.${environment}.${domain}`;

      const customDomain = new apigatewayv2.DomainName(this, `CustomDomain${index}`, {
        domainName: apiGwDomainName,
        certificate: this.sanCertificate,
      });

      // Create API mapping to connect custom domain to HTTP API
      new apigatewayv2.ApiMapping(this, `ApiMapping${index}`, {
        api: props.httpApi,
        domainName: customDomain,
      });

      this.customDomains.set(domain, customDomain);

      if (!firstDomain) {
        firstDomain = customDomain;
      }

      // Output custom domain
      new cdk.CfnOutput(this, `${this.sanitizeDomainName(domain)}ApiGwDomain`, {
        value: apiGwDomainName,
        description: `API Gateway custom domain for ${domain}`,
        exportName: this.naming.exportName(`${this.sanitizeDomainName(domain)}-api-gw-domain`),
      });
    });

    // Store regional domain name and hosted zone ID for Route53 A records
    // All custom domains share the same regional endpoint
    this.regionalDomainName = firstDomain!.regionalDomainName;
    this.regionalHostedZoneId = firstDomain!.regionalHostedZoneId;

    // Export regional domain info via SSM for DNS record creation
    new ssm.StringParameter(this, 'SsmApiGwRegionalDomain', {
      parameterName: this.naming.ssmParameterName('api-gateway', 'regional-domain-name'),
      stringValue: this.regionalDomainName,
      description: `API Gateway regional domain name for ${environment}`,
    });

    new ssm.StringParameter(this, 'SsmApiGwRegionalHostedZoneId', {
      parameterName: this.naming.ssmParameterName('api-gateway', 'regional-hosted-zone-id'),
      stringValue: this.regionalHostedZoneId,
      description: `API Gateway regional hosted zone ID for ${environment}`,
    });
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
