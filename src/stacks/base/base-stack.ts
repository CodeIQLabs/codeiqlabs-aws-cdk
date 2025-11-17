/**
 * Base stack class for all AWS CDK stacks
 *
 * This module provides a unified base stack class for all infrastructure stacks,
 * regardless of deployment pattern (single-account or multi-environment).
 * It eliminates repetitive code for environment validation, naming initialization,
 * and tagging while ensuring all configuration comes from manifest files.
 *
 * @example Single-account component (organization, identityCenter, domains)
 * ```typescript
 * import { BaseStack, BaseStackConfig } from '@codeiqlabs/aws-cdk';
 *
 * const stackConfig: BaseStackConfig = {
 *   project: 'CodeIQLabs',
 *   environment: 'mgmt',
 *   region: 'us-east-1',
 *   accountId: '682475224767',
 *   owner: 'CodeIQLabs',
 *   company: 'CodeIQLabs',
 * };
 *
 * export class OrganizationsStack extends BaseStack {
 *   constructor(scope: Construct, id: string, props: OrganizationsStackProps) {
 *     super(scope, id, 'Organizations', {
 *       ...props,
 *       stackConfig,
 *     });
 *     // Stack-specific logic...
 *   }
 * }
 * ```
 *
 * @example Multi-environment component (staticHosting, networking)
 * ```typescript
 * const stackConfig: BaseStackConfig = {
 *   project: 'CodeIQLabs',
 *   environment: 'nprd',  // or 'prod', 'pprod', etc.
 *   region: 'us-east-1',
 *   accountId: '466279485605',
 *   owner: 'CodeIQLabs',
 *   company: 'CodeIQLabs',
 * };
 *
 * export class StaticHostingStack extends BaseStack {
 *   constructor(scope: Construct, id: string, props: StaticHostingStackProps) {
 *     super(scope, id, 'Static-Hosting', {
 *       ...props,
 *       stackConfig,
 *     });
 *     // Stack-specific logic...
 *   }
 * }
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import { Tags } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { ResourceNaming, generateStandardTags } from '@codeiqlabs/aws-utils';

/**
 * Base stack configuration
 *
 * This configuration is environment-based, not account-type-based.
 * The same configuration structure works for any deployment pattern:
 * - Single-account components (organization, identityCenter, domains)
 * - Multi-environment components (staticHosting, networking)
 *
 * The environment field determines the naming convention:
 * - 'mgmt' → Display name: 'Management' → Stack: 'MyProject-Management-Organizations-Stack'
 * - 'nprd' → Display name: 'NonProd' → Stack: 'MyProject-NonProd-VPC-Stack'
 * - 'prod' → Display name: 'Prod' → Stack: 'MyProject-Prod-VPC-Stack'
 */
export interface BaseStackConfig {
  /** Project name (e.g., 'CodeIQLabs', 'BudgetTrack') */
  project: string;

  /** Environment name (e.g., 'mgmt', 'nprd', 'prod', 'pprod', 'shared') */
  environment: string;

  /** AWS region (e.g., 'us-east-1') */
  region: string;

  /** AWS account ID (12-digit string) */
  accountId: string;

  /** Resource owner (for tagging) */
  owner: string;

  /** Company name (for tagging) */
  company: string;
}

/**
 * Props for BaseStack
 *
 * Extends CDK StackProps with our standardized configuration
 */
export interface BaseStackProps extends cdk.StackProps {
  /** Stack configuration (required) */
  stackConfig: BaseStackConfig;
}

/**
 * Base stack class for all AWS stacks
 *
 * This class provides standardized initialization for all stacks:
 * - Validates all required configuration is provided
 * - Initializes ResourceNaming with manifest values
 * - Applies standardized stack naming
 * - Automatically applies standard tags
 * - Sets up proper environment configuration
 *
 * Key principles:
 * - All configuration comes from manifest (no hardcoded values)
 * - Fail-fast validation with clear error messages
 * - Consistent naming and tagging across all stacks
 * - Reusable across different projects and deployment patterns
 * - Environment-based naming (not account-type-based)
 *
 * **Design Note:**
 * This class replaces the previous ManagementBaseStack and WorkloadBaseStack classes,
 * which were nearly identical and created confusion about account-type vs environment-based
 * naming. The unified BaseStack makes it clear that naming is environment-based.
 */
export abstract class BaseStack extends cdk.Stack {
  /** ResourceNaming instance for generating consistent resource names */
  protected readonly naming: ResourceNaming;

  /** Stack configuration */
  private readonly stackConfig: BaseStackConfig;

  /**
   * Creates a new BaseStack
   *
   * @param scope - CDK construct scope
   * @param _id - Construct ID (will be replaced with standardized stack name)
   * @param component - Component name for the stack (e.g., 'Organizations', 'Static-Hosting')
   * @param props - Stack properties including stackConfig
   */
  constructor(scope: Construct, _id: string, component: string, props: BaseStackProps) {
    const { stackConfig } = props;

    // Validate required configuration with clear error messages
    if (!stackConfig?.project?.trim()) {
      throw new Error('BaseStack: project is required in stackConfig (must come from manifest)');
    }
    if (!stackConfig?.environment?.trim()) {
      throw new Error(
        'BaseStack: environment is required in stackConfig (must come from manifest)',
      );
    }
    if (!stackConfig?.region?.trim()) {
      throw new Error('BaseStack: region is required in stackConfig (must come from manifest)');
    }
    if (!stackConfig?.accountId?.trim()) {
      throw new Error('BaseStack: accountId is required in stackConfig (must come from manifest)');
    }

    // Initialize ResourceNaming utility
    const naming = new ResourceNaming({
      project: stackConfig.project,
      environment: stackConfig.environment,
      region: stackConfig.region,
      accountId: stackConfig.accountId,
    });

    // Generate standardized stack name
    const stackName = naming.stackName(component);

    // Initialize the stack with standardized configuration
    super(scope, stackName, {
      ...props,
      stackName,
      env: {
        account: stackConfig.accountId,
        region: stackConfig.region,
      },
    });

    // Store naming instance and config for use by subclasses
    this.naming = naming;
    this.stackConfig = stackConfig;

    // Apply standard tags to all resources in this stack
    const standardTags = generateStandardTags(naming.getConfig(), {
      component,
      owner: stackConfig.owner,
      company: stackConfig.company,
    });

    Object.entries(standardTags).forEach(([key, value]) => {
      Tags.of(this).add(key, value);
    });
  }

  /**
   * Get the stack configuration
   *
   * @returns The stack configuration object
   */
  protected getStackConfig(): BaseStackConfig {
    return this.stackConfig;
  }
}
