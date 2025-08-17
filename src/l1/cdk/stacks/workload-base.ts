/**
 * Base stack class for AWS Workload Account stacks
 * 
 * This module provides a reusable base stack class for workload account infrastructure.
 * It eliminates repetitive code for environment validation, naming initialization, and tagging
 * while ensuring all configuration comes from manifest files (no hardcoded values).
 * 
 * @example
 * ```typescript
 * import { WorkloadBaseStack, WorkloadBaseStackConfig } from '@codeiqlabs/aws-cdk';
 * 
 * const workloadConfig: WorkloadBaseStackConfig = {
 *   project: cfg.project,
 *   environment: cfg.environment,
 *   region: cfg.region,
 *   accountId: cfg.accountId,
 * };
 * 
 * export class DeploymentPermissionsStack extends WorkloadBaseStack {
 *   constructor(scope: Construct, id: string, props: DeploymentPermissionsStackProps) {
 *     super(scope, id, 'Deployment-Permissions', props);
 *     // Stack implementation...
 *   }
 * }
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { ResourceNaming } from '@codeiqlabs/aws-utils/naming/convenience';
import { applyStandardTags } from '../index';

/**
 * Configuration for WorkloadBaseStack
 * All values must come from manifest configuration - no hardcoded values allowed
 */
export interface WorkloadBaseStackConfig {
  /** Project name (e.g., 'CodeIQLabs', 'BudgetTrack') - from manifest */
  project: string;
  /** Environment name (e.g., 'np', 'prod', 'nprd') - from manifest */
  environment: string;
  /** AWS region - from manifest */
  region: string;
  /** AWS account ID - from manifest */
  accountId: string;
}

/**
 * Props for WorkloadBaseStack
 */
export interface WorkloadBaseStackProps extends cdk.StackProps {
  /** Workload configuration from manifest */
  workloadConfig: WorkloadBaseStackConfig;
}

/**
 * Base stack class for Workload AWS stacks
 * 
 * This class provides standardized initialization for workload account stacks:
 * - Validates all required configuration is provided
 * - Initializes ResourceNaming with manifest values
 * - Applies standardized stack naming
 * - Automatically applies standard tags
 * - Sets up proper environment configuration
 * 
 * Key principles:
 * - All configuration comes from manifest (no hardcoded values)
 * - Fail-fast validation with clear error messages
 * - Consistent naming and tagging across all workload stacks
 * - Reusable across different projects (CodeIQLabs, BudgetTrack, etc.)
 * - Purpose-built for application workload accounts (custaws, BTAWS, etc.)
 */
export abstract class WorkloadBaseStack extends cdk.Stack {
  /** ResourceNaming instance for generating consistent resource names */
  protected readonly naming: ResourceNaming;

  /**
   * Creates a new WorkloadBaseStack
   *
   * @param scope - CDK construct scope
   * @param _id - Construct ID (will be replaced with standardized stack name)
   * @param component - Component name for the stack (e.g., 'Deployment-Permissions', 'VPC')
   * @param props - Stack properties including workloadConfig
   */
  constructor(scope: Construct, _id: string, component: string, props: WorkloadBaseStackProps) {
    const { workloadConfig } = props;
    
    // Validate required configuration with clear error messages
    if (!workloadConfig?.project?.trim()) {
      throw new Error('WorkloadBaseStack: project is required in workloadConfig (must come from manifest)');
    }
    if (!workloadConfig?.environment?.trim()) {
      throw new Error('WorkloadBaseStack: environment is required in workloadConfig (must come from manifest)');
    }
    if (!workloadConfig?.region?.trim()) {
      throw new Error('WorkloadBaseStack: region is required in workloadConfig (must come from manifest)');
    }
    if (!workloadConfig?.accountId?.trim()) {
      throw new Error('WorkloadBaseStack: accountId is required in workloadConfig (must come from manifest)');
    }

    // Initialize ResourceNaming with validated configuration
    const naming = new ResourceNaming({
      project: workloadConfig.project,
      environment: workloadConfig.environment,
      region: workloadConfig.region,
      accountId: workloadConfig.accountId,
    });

    // Generate standardized stack name
    const stackName = naming.stackName(component);

    // Initialize the stack with standardized configuration
    super(scope, stackName, {
      ...props,
      stackName,
      env: {
        account: workloadConfig.accountId,
        region: workloadConfig.region,
      },
    });

    // Store naming instance for use by subclasses
    this.naming = naming;

    // Apply standard tags to all resources in this stack
    applyStandardTags(
      this,
      naming.getConfig(),
      { component }
    );
  }

  /**
   * Get the workload configuration used by this stack
   * Useful for subclasses that need access to the original configuration
   */
  protected getWorkloadConfig(): WorkloadBaseStackConfig {
    const config = this.naming.getConfig();
    return {
      project: config.project,
      environment: config.environment,
      region: config.region!, // Safe to assert non-null since we validated in constructor
      accountId: config.accountId!, // Safe to assert non-null since we validated in constructor
    };
  }
}
