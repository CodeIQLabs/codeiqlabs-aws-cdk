/**
 * Workload Account Stack Classes
 *
 * This module provides reusable stack classes for common workload account
 * infrastructure patterns. These stacks follow the BaseStack + L2 Construct
 * pattern and can be used across any CodeIQLabs workload account setup.
 *
 * Available stacks:
 * - StaticHostingDomainStack: Route53 hosted zone and ACM certificate
 * - StaticHostingFrontendStack: S3 + CloudFront static hosting infrastructure
 *
 * Each stack wraps one or more high-level constructs with minimal business logic,
 * making them reusable across different projects and applications.
 */

// Static hosting stacks
export { StaticHostingDomainStack } from './static-hosting-domain-stack';
export { StaticHostingFrontendStack } from './static-hosting-frontend-stack';

// Export props interfaces
export type { StaticHostingDomainStackProps } from './static-hosting-domain-stack';
export type { StaticHostingFrontendStackProps } from './static-hosting-frontend-stack';
