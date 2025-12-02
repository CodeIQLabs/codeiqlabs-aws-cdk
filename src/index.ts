/**
 * @codeiqlabs/aws-cdk - AWS CDK wrapper utilities for CodeIQLabs projects
 *
 * This package provides a unified component-based architecture for AWS CDK projects.
 *
 * **Unified Component-Based Approach**
 * - Single createApp() function for all infrastructure
 * - Component-based orchestration (no manifestType required)
 * - Maximum flexibility - deploy any component to any account
 *
 * @example
 * ```typescript
 * import { createApp } from '@codeiqlabs/aws-cdk';
 * createApp().then(app => app.synth());
 * ```
 */

// Layer 0: Foundation Layer (Core constructs with automatic naming/tagging)
export { TaggedConstruct } from './core/constructs/tagged-construct';
export { NamedConstruct } from './core/constructs/named-construct';

// Layer 1: Application Layer (Component-based orchestration)
export * from './application';

// Unified factory function
export { createApp } from './application/factories';

// Layer 2: Stack Layer (Infrastructure grouping)
export * from './stacks';

// Layer 4: Construct Layer (Individual AWS service constructs)
export * from './constructs';

// Layer 3: Stage Layer (Deployment stages)
export * from './stages';
