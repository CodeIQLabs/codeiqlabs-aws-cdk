/**
 * Customization Stacks
 *
 * Stacks for cross-account customization resources that are deployed
 * to workload accounts from the Management account.
 *
 * Includes:
 * - GitHub OIDC stacks for CI/CD authentication
 * - Infrastructure stacks (VPC) for saas-aws consumption
 * - Subdomain Zone stack for cross-account subdomain delegation
 * - API Gateway Domain stack for creating custom domains with certificates (customization-aws)
 * - Workload params stack for common SSM parameters
 *
 * Deprecated (kept for backward compatibility):
 * - InfraAlbStack - ALB no longer used, migrated to API Gateway
 * - AlbDnsRecordStack - ALB no longer used, migrated to API Gateway
 * - API Gateway Custom Domain stack - use ApiGatewayDomainStack
 * - API Gateway DNS Record stack - merged into ApiGatewayDomainStack
 * - Origin Domain stack - use Subdomain Zone instead
 * - VPC Origin stack - use Subdomain Zone instead
 */
export * from './github-oidc-stack';
export * from './infra-vpc-stack';
export * from './infra-alb-stack'; // Deprecated - ALB no longer used
export * from './subdomain-zone-stack';
export * from './alb-dns-record-stack'; // Deprecated - ALB no longer used
export * from './api-gateway-domain-stack';
export * from './api-gateway-custom-domain-stack';
export * from './api-gateway-dns-record-stack';
export * from './origin-domain-stack';
export * from './vpc-origin-stack';
export * from './workload-params-stack';
