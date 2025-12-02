/**
 * Customization Stacks
 *
 * Stacks for cross-account customization resources that are deployed
 * to workload accounts from the Management account.
 *
 * These stacks support the centralized domain architecture where:
 * - CloudFront distributions are in the Management account
 * - ALBs and other resources are in workload accounts
 * - Cross-account roles enable the Management account to discover resources
 *
 * Also includes GitHub OIDC stacks for CI/CD authentication.
 */

export * from './origin-discovery-read-role-stack';
export * from './github-oidc-stack';
