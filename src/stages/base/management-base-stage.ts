/**
 * Management Base Stage for CodeIQLabs Infrastructure
 *
 * This module provides the enhanced base stage class specifically designed for
 * management account infrastructure with automatic configuration transformation
 * and standardized patterns.
 */

import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { ManifestConfigAdapter, ResourceNaming } from '@codeiqlabs/aws-utils';
import type { ManagementAppConfig, ManagementBaseStackConfig } from '@codeiqlabs/aws-utils';
import type {
  EnhancedManagementStageProps,
  StackCreationOptions,
  StackCreationResult,
  ManagementStackConstructor,
} from '../stage-types';

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
export abstract class ManagementBaseStage extends cdk.Stage {
  /** The original management manifest configuration */
  protected readonly manifest: ManagementAppConfig;

  /** The transformed management configuration for stacks */
  protected readonly managementConfig: ManagementBaseStackConfig;

  /** Resource naming utility for consistent naming patterns */
  protected readonly naming: ResourceNaming;

  constructor(scope: Construct, id: string, props: EnhancedManagementStageProps) {
    super(scope, id, props);

    // Transform manifest to base stack configuration
    const managementConfig = ManifestConfigAdapter.toManagementConfig(props.cfg);

    // Apply any configuration overrides
    const finalConfig = props.configOverrides
      ? { ...managementConfig, ...props.configOverrides }
      : managementConfig;

    this.manifest = props.cfg;
    this.managementConfig = finalConfig;
    this.naming = new ResourceNaming({
      project: finalConfig.project,
      environment: finalConfig.environment,
      region: finalConfig.region,
      accountId: finalConfig.accountId,
    });

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
   * Create a management stack with automatic configuration and naming
   */
  private createManagementStack<T extends cdk.Stack>(
    stackClass: ManagementStackConstructor<T>,
    component: string,
    options: StackCreationOptions = {},
  ): StackCreationResult<T> {
    const stackName = options.stackName || this.naming.stackName(component);
    const env = options.env || {
      account: this.managementConfig.accountId,
      region: this.managementConfig.region,
    };

    const stack = new stackClass(this, stackName, {
      managementConfig: this.managementConfig,
      env,
      ...options.additionalProps,
    });

    // Apply dependencies if specified
    if (options.dependencies) {
      for (const dependency of options.dependencies) {
        stack.addDependency(dependency);
      }
    }

    return {
      stack,
      stackName,
      config: this.managementConfig,
    };
  }

  /**
   * Validate management-specific configuration requirements
   */
  protected validateManagementConfiguration(): void {
    // Basic configuration validation
    if (!this.managementConfig.project) {
      throw new Error('Stage configuration missing required project name');
    }

    if (!this.managementConfig.environment) {
      throw new Error('Stage configuration missing required environment');
    }

    if (!this.managementConfig.region) {
      throw new Error('Stage configuration missing required region');
    }

    if (!this.managementConfig.accountId) {
      throw new Error('Stage configuration missing required account ID');
    }

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
