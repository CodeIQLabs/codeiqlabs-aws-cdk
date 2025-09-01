/**
 * Management Base Stage for CodeIQLabs Infrastructure
 *
 * This module provides the enhanced base stage class specifically designed for
 * management account infrastructure with automatic configuration transformation
 * and standardized patterns.
 */

import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { ManifestConfigAdapter } from '@codeiqlabs/aws-utils';
import type { ManagementAppConfig, ManagementBaseStackConfig } from '@codeiqlabs/aws-utils';
import { BaseStage } from './base-stage';
import type {
  EnhancedManagementStageProps,
  StackCreationOptions,
  StackCreationResult,
  ManagementStackConstructor,
} from './stage-types';

/**
 * Enhanced base stage for management account infrastructure
 *
 * This class provides:
 * - Automatic configuration transformation from ManagementAppConfig to ManagementBaseStackConfig
 * - Standardized stack creation with management-specific patterns
 * - Built-in validation for management account requirements
 * - Consistent naming and tagging for management resources
 *
 * @example
 * ```typescript
 * export class ManagementStage extends ManagementBaseStage {
 *   constructor(scope: Construct, id: string, props: EnhancedManagementStageProps) {
 *     super(scope, id, props);
 *
 *     // Create stacks using the enhanced utilities
 *     const orgResult = this.createStack(OrganizationsStack, 'Organizations', {
 *       additionalProps: { orgRootId: this.manifest.organization.rootId }
 *     });
 *
 *     if (this.manifest.identityCenter.enabled) {
 *       this.createStack(IdentityCenterStack, 'IdentityCenter', {
 *         dependencies: [orgResult.stack],
 *         additionalProps: { accountIds: orgResult.stack.accountIds }
 *       });
 *     }
 *   }
 * }
 * ```
 */
export abstract class ManagementBaseStage extends BaseStage {
  /** The original management manifest configuration */
  protected readonly manifest: ManagementAppConfig;

  /** The transformed management configuration for stacks */
  protected readonly managementConfig: ManagementBaseStackConfig;

  constructor(scope: Construct, id: string, props: EnhancedManagementStageProps) {
    // Transform manifest to base stack configuration
    const managementConfig = ManifestConfigAdapter.toManagementConfig(props.cfg);

    // Apply any configuration overrides
    const finalConfig = props.configOverrides
      ? { ...managementConfig, ...props.configOverrides }
      : managementConfig;

    super(scope, id, props, finalConfig);

    this.manifest = props.cfg;
    this.managementConfig = finalConfig;

    // Validate management-specific requirements
    this.validateManagementConfiguration();
  }

  /**
   * Create a management stack with enhanced configuration and naming
   *
   * This method provides a simplified interface for creating management stacks
   * with automatic configuration transformation and standardized patterns.
   *
   * @param stackClass - The management stack constructor class
   * @param component - The component name for the stack
   * @param options - Stack creation options
   * @returns Stack creation result with metadata
   */
  protected createStack<T extends cdk.Stack>(
    stackClass: ManagementStackConstructor<T>,
    component: string,
    options: StackCreationOptions = {},
  ): StackCreationResult<T> {
    return this.createManagementStack(stackClass, component, options);
  }

  /**
   * Validate management-specific configuration requirements
   */
  protected validateManagementConfiguration(): void {
    super.validateConfiguration();

    // Validate management account environment
    if (this.managementConfig.environment !== 'mgmt') {
      throw new Error(
        `Management stage must use 'mgmt' environment, got '${this.managementConfig.environment}'`,
      );
    }

    // Validate organization configuration if present
    if (this.manifest.organization?.enabled) {
      if (!this.manifest.organization.rootId) {
        throw new Error('Organization configuration missing required rootId');
      }

      if (!this.manifest.organization.mode) {
        throw new Error('Organization configuration missing required mode');
      }
    }

    // Validate Identity Center configuration if present
    if (this.manifest.identityCenter?.enabled) {
      if (!this.manifest.identityCenter.instanceArn) {
        throw new Error('Identity Center configuration requires instanceArn');
      }
    }
  }

  /**
   * Check if AWS Organizations is enabled in the manifest
   */
  protected isOrganizationEnabled(): boolean {
    return this.manifest.organization?.enabled === true;
  }

  /**
   * Check if AWS Identity Center is enabled in the manifest
   */
  protected isIdentityCenterEnabled(): boolean {
    return this.manifest.identityCenter?.enabled === true;
  }

  /**
   * Get the organization configuration
   */
  protected getOrganizationConfig() {
    if (!this.isOrganizationEnabled()) {
      throw new Error('Organization is not enabled in manifest configuration');
    }
    return this.manifest.organization;
  }

  /**
   * Get the Identity Center configuration
   */
  protected getIdentityCenterConfig() {
    if (!this.isIdentityCenterEnabled()) {
      throw new Error('Identity Center is not enabled in manifest configuration');
    }
    return this.manifest.identityCenter;
  }

  /**
   * Get the original management manifest
   */
  public getManifest(): ManagementAppConfig {
    return this.manifest;
  }

  /**
   * Get the transformed management configuration
   */
  public getManagementConfig(): ManagementBaseStackConfig {
    return this.managementConfig;
  }
}
