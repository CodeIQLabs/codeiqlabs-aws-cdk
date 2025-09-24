/**
 * Management Stage Registry
 *
 * This module provides component-based stage registration and lookup for management stages.
 * It maintains a registry of stage classes mapped to management components and provides
 * type-safe access to registered stages.
 */

import type {
  ManagementStageConstructor,
  ManagementStageRegistryInterface,
} from './stage-registry-types';

// Import management stage classes
import { OrganizationsStage } from '../../stages/management/organizations-stage';
import { IdentityCenterStage } from '../../stages/management/identity-center-stage';
import { DomainAuthorityStage } from '../../stages/management/domain-authority-stage';

/**
 * Registry for management stage classes with component-based lookup
 *
 * This class provides a centralized registry for management stages, allowing
 * orchestrators to dynamically look up stage classes based on detected components
 * without hard-coding stage imports in orchestration logic.
 *
 * @example
 * ```typescript
 * const registry = new ManagementStageRegistry();
 * const stageClass = registry.getStage('organizations');
 * if (stageClass) {
 *   app.createManagementStage(stageClass);
 * }
 * ```
 */
export class ManagementStageRegistry implements ManagementStageRegistryInterface {
  private stages = new Map<string, ManagementStageConstructor>();

  constructor() {
    // Register default management stages
    this.registerStage('organizations', OrganizationsStage);
    this.registerStage('identityCenter', IdentityCenterStage);
    this.registerStage('domainAuthority', DomainAuthorityStage);
  }

  /**
   * Register a management stage for a specific component
   *
   * @param component - The component name (e.g., 'organizations', 'identityCenter')
   * @param stageClass - The management stage constructor class
   */
  registerStage(component: string, stageClass: ManagementStageConstructor): void {
    this.stages.set(component, stageClass);
  }

  /**
   * Get a management stage class for a specific component
   *
   * @param component - The component name to look up
   * @returns The stage constructor class or undefined if not found
   */
  getStage(component: string): ManagementStageConstructor | undefined {
    return this.stages.get(component);
  }

  /**
   * Get management stage classes for multiple components
   *
   * @param components - Array of component names to look up
   * @returns Map of component names to stage constructor classes
   */
  getStagesForComponents(components: string[]): Map<string, ManagementStageConstructor> {
    const result = new Map<string, ManagementStageConstructor>();

    for (const component of components) {
      const stageClass = this.stages.get(component);
      if (stageClass) {
        result.set(component, stageClass);
      }
    }

    return result;
  }

  /**
   * List all registered management components
   *
   * @returns Array of registered component names
   */
  listRegisteredComponents(): string[] {
    return Array.from(this.stages.keys());
  }
}
