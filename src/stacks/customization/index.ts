/**
 * Customization Stacks
 *
 * Shared cross-account customization resources deployed to workload accounts.
 *
 * Includes:
 * - GitHub OIDC stacks for CI/CD authentication
 *
 * Note: Pattern-specific stacks (SubdomainZone, ApiGatewayDomain, WorkloadParams)
 * have been moved to src/patterns/serverless-saas/stacks/edge/
 */
export * from './github-oidc-stack';
