/**
 * Customization Stacks
 *
 * Stacks for cross-account customization resources that are deployed
 * to workload accounts from the Management account.
 *
 * Includes:
 * - GitHub OIDC stacks for CI/CD authentication
 * - Infrastructure stacks (VPC, ALB) for saas-aws consumption
 * - Subdomain Zone stack for cross-account subdomain delegation
 * - ALB DNS Record stack for creating A records pointing to ALB
 * - Origin Domain stack (deprecated - use Subdomain Zone instead)
 * - VPC Origin stack (deprecated - use Subdomain Zone instead)
 * - Workload params stack for common SSM parameters
 */
export * from './github-oidc-stack';
export * from './infra-vpc-stack';
export * from './infra-alb-stack';
export * from './subdomain-zone-stack';
export * from './alb-dns-record-stack';
export * from './origin-domain-stack';
export * from './vpc-origin-stack';
export * from './workload-params-stack';
