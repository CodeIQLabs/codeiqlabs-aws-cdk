/**
 * Base stack class for AWS Management Account stacks
 * 
 * This module provides a reusable base stack class for management account infrastructure.
 * It eliminates repetitive code for environment validation, naming initialization, and tagging
 * while ensuring all configuration comes from manifest files (no hardcoded values).
 * 
 * @example
 * ```typescript
 * import { ManagementBaseStack, ManagementBaseStackConfig } from '@codeiqlabs/aws-utils/cdk/stacks';
 * 
 * const managementConfig: ManagementBaseStackConfig = {
 *   project: cfg.project,
 *   environment: cfg.management.environment,
 *   region: cfg.management.region,
 *   accountId: cfg.management.accountId,
 * };
 * 
 * export class OrganizationsStack extends ManagementBaseStack {
 *   constructor(scope: Construct, id: string, props: OrganizationsStackProps) {
 *     super(scope, id, 'Organizations', props);
 *     // Stack implementation...
 *   }
 * }
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { ResourceNaming } from '@codeiqlabs/aws-utils/naming/convenience';
import { applyStandardTagsWithNaming } from '../index';

/**
 * Configuration for ManagementBaseStack
 * All values must come from manifest configuration - no hardcoded values allowed
 */
export interface ManagementBaseStackConfig {
  /** Project name (e.g., 'CodeIQLabs', 'BudgetTrack') - from manifest */
  project: string;
  /** Environment name (e.g., 'mgmt', 'Management') - from manifest */
  environment: string;
  /** AWS region - from manifest */
  region: string;
  /** AWS account ID - from manifest */
  accountId: string;
}

/**
 * Props for ManagementBaseStack
 */
export interface ManagementBaseStackProps extends cdk.StackProps {
  /** Management configuration from manifest */
  managementConfig: ManagementBaseStackConfig;
}

/**
 * Base stack class for Management AWS stacks
 * 
 * This class provides standardized initialization for management account stacks:
 * - Validates all required configuration is provided
 * - Initializes ResourceNaming with manifest values
 * - Applies standardized stack naming
 * - Automatically applies standard tags
 * - Sets up proper environment configuration
 * 
 * Key principles:
 * - All configuration comes from manifest (no hardcoded values)
 * - Fail-fast validation with clear error messages
 * - Consistent naming and tagging across all management stacks
 * - Reusable across different projects (CodeIQLabs, BudgetTrack, etc.)
 */
export abstract class ManagementBaseStack extends cdk.Stack {
  /** ResourceNaming instance for generating consistent resource names */
  protected readonly naming: ResourceNaming;

  /**
   * Creates a new ManagementBaseStack
   *
   * @param scope - CDK construct scope
   * @param _id - Construct ID (will be replaced with standardized stack name)
   * @param component - Component name for the stack (e.g., 'Organizations', 'Identity-Center')
   * @param props - Stack properties including managementConfig
   */
  constructor(scope: Construct, _id: string, component: string, props: ManagementBaseStackProps) {
    const { managementConfig } = props;
    
    // Validate required configuration with clear error messages
    if (!managementConfig?.project?.trim()) {
      throw new Error('ManagementBaseStack: project is required in managementConfig (must come from manifest)');
    }
    if (!managementConfig?.environment?.trim()) {
      throw new Error('ManagementBaseStack: environment is required in managementConfig (must come from manifest)');
    }
    if (!managementConfig?.region?.trim()) {
      throw new Error('ManagementBaseStack: region is required in managementConfig (must come from manifest)');
    }
    if (!managementConfig?.accountId?.trim()) {
      throw new Error('ManagementBaseStack: accountId is required in managementConfig (must come from manifest)');
    }

    // Initialize naming with configuration from manifest (no hardcoded values)
    const naming = new ResourceNaming({
      project: managementConfig.project,
      environment: managementConfig.environment,
      region: managementConfig.region,
      accountId: managementConfig.accountId,
    });

    // Generate standardized stack name
    const stackName = naming.stackName(component);

    // Initialize the stack with standardized configuration
    super(scope, stackName, {
      ...props,
      stackName,
      env: {
        account: managementConfig.accountId,
        region: managementConfig.region,
      },
    });

    // Store naming instance for use by subclasses
    this.naming = naming;

    // Apply standard tags to all resources in this stack
    applyStandardTagsWithNaming(
      this,
      naming,
      { component }
    );
  }

  /**
   * Get the management configuration used by this stack
   * Useful for subclasses that need access to the original configuration
   */
  protected getManagementConfig(): ManagementBaseStackConfig {
    const config = this.naming.getConfig();
    return {
      project: config.project,
      environment: config.environment,
      region: config.region!, // Safe to assert non-null since we validated in constructor
      accountId: config.accountId!, // Safe to assert non-null since we validated in constructor
    };
  }
}
