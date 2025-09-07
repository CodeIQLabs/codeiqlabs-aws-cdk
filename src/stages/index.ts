/**
 * Enhanced Base Stage Classes for CodeIQLabs Infrastructure
 *
 * This module provides enhanced base stage classes that eliminate repetitive
 * configuration transformation code and provide standardized patterns for
 * creating infrastructure stages across all CodeIQLabs projects.
 *
 * Key features:
 * - Automatic configuration transformation from manifest to stack configs
 * - Standardized stack creation utilities with naming and tagging
 * - Built-in validation for account-specific requirements
 * - Environment-specific configuration handling for workload stages
 * - Type-safe interfaces with comprehensive error handling
 *
 * @example
 * ```typescript
 * // Management stage example
 * import { ManagementBaseStage } from '@codeiqlabs/aws-cdk/stages';
 *
 * export class ManagementStage extends ManagementBaseStage {
 *   constructor(scope: Construct, id: string, props: EnhancedManagementStageProps) {
 *     super(scope, id, props);
 *
 *     const orgResult = this.createStack(OrganizationsStack, 'Organizations');
 *
 *     if (this.isIdentityCenterEnabled()) {
 *       this.createStack(IdentityCenterStack, 'IdentityCenter', {
 *         dependencies: [orgResult.stack]
 *       });
 *     }
 *   }
 * }
 *
 * // Workload stage example
 * import { WorkloadBaseStage } from '@codeiqlabs/aws-cdk/stages';
 *
 * export class ApplicationStage extends WorkloadBaseStage {
 *   constructor(scope: Construct, id: string, props: EnhancedWorkloadStageProps) {
 *     super(scope, id, props);
 *
 *     const vpcResult = this.createStack(VpcStack, 'Vpc');
 *
 *     this.createStack(ApplicationStack, 'Application', {
 *       dependencies: [vpcResult.stack],
 *       additionalProps: {
 *         enableMonitoring: this.isProductionEnvironment()
 *       }
 *     });
 *   }
 * }
 * ```
 */

// Base stage classes
export { ManagementBaseStage } from './management-base-stage';
export { WorkloadBaseStage } from './workload-base-stage';

// Declarative stage classes
export { DeclarativeManagementBaseStage } from './declarative-management-base-stage';

// Type definitions
export type {
  // Stage props interfaces
  EnhancedManagementStageProps,
  EnhancedWorkloadStageProps,

  // Stack constructor types
  ManagementStackConstructor,
  WorkloadStackConstructor,

  // Utility types
  StackCreationOptions,
  StackCreationResult,
} from './stage-types';

// Declarative types
export type {
  ManagementStackRegistration,
  WorkloadStackRegistration,
  DeclarativeStackResult,
} from './declarative-types';
