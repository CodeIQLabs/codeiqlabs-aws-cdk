/**
 * @codeiqlabs/aws-cdk - AWS CDK wrapper utilities for CodeIQLabs projects
 *
 * This package provides a clean 5-layer architecture for AWS CDK projects:
 * - Layer 0: Foundation Layer (Core constructs with automatic naming/tagging)
 * - Layer 1: Application Layer (Auto-detection and factory functions)
 * - Layer 2: Stage Layer (Pattern-specific orchestration)
 * - Layer 3: Stack Layer (Infrastructure grouping)
 * - Layer 4: Construct Layer (Individual AWS service constructs)
 *
 * @example
 * ```typescript
 * // Simple auto-detection (most common usage)
 * import { createAutoApp } from '@codeiqlabs/aws-cdk';
 * createAutoApp().then(app => app.synth());
 *
 * // Import core foundation layer
 * import { TaggedConstruct, NamedConstruct } from '@codeiqlabs/aws-cdk/core';
 *
 * // Import application bootstrap utilities
 * import { CdkApplication, createAutoApp } from '@codeiqlabs/aws-cdk/application';
 *
 * // Import pattern-specific stages
 * import { OrganizationsStage, StaticHostingStage } from '@codeiqlabs/aws-cdk/stages';
 *
 * // Import stack classes
 * import { OrganizationsStack, StaticHostingDomainStack } from '@codeiqlabs/aws-cdk/stacks';
 *
 * // Import construct classes
 * import { S3BucketConstruct, CloudFrontDistributionConstruct } from '@codeiqlabs/aws-cdk/constructs';
 * ```
 */

// Layer 0: Foundation Layer (Core constructs with automatic patterns)
export { TaggedConstruct } from './core/constructs/tagged-construct';
export { NamedConstruct } from './core/constructs/named-construct';

// Layer 1: Application Layer (Auto-detection and factory functions)
export * from './application';

// Simplified auto-detection exports (most commonly used)
export { createAutoApp, createManagementApp, createWorkloadApp } from './application/factories';

// Detection utilities
export * from './detection/management-detector';
export * from './detection/workload-detector';

// Layer 2: Stage Layer (Pattern-specific orchestration)
export * from './stages';

// Management Stages
export { OrganizationsStage } from './stages/management/organizations-stage';
export { IdentityCenterStage } from './stages/management/identity-center-stage';
export { DomainAuthorityStage } from './stages/management/domain-authority-stage';

// Workload Stages
export { StaticHostingStage } from './stages/workload/static-hosting-stage';

// Layer 3: Stack Layer (Infrastructure grouping)
export * from './stacks';

// Layer 4: Construct Layer (Individual AWS service constructs)
export * from './constructs';
