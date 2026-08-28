/**
 * Serverless SaaS Edge Stacks
 *
 * Edge infrastructure stacks deployed to the management account for
 * CDN, DNS, certificates, and cross-account domain delegation.
 */
export * from './root-domain-stack';
export * from './acm-waf-stack';
export * from './cloudfront-vpc-origin-stack';
export * from './dns-records-stack';
export * from './static-webapp-stack';
export * from './subdomain-zone-stack';
export * from './api-gateway-domain-stack';
export * from './workload-params-stack';
export * from './ses-email-stack';
