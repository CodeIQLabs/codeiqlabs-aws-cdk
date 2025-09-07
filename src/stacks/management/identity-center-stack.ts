/**
 * Management Identity Center Stack for AWS Identity Center (SSO)
 *
 * This module provides a reusable stack class for AWS Identity Center setup
 * in management accounts. It follows the BaseStack + L2 Construct pattern
 * and can be used across any CodeIQLabs management account setup.
 */

import { Construct } from 'constructs';
import { ManagementBaseStack, ManagementBaseStackProps } from '../base/management-base';
import { IdentityCenterConstruct } from '../../constructs/identity-center/constructs';
import type { ManagementAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Props for ManagementIdentityCenterStack
 */
export interface ManagementIdentityCenterStackProps extends ManagementBaseStackProps {
  /** The complete management manifest configuration */
  config: ManagementAppConfig;
  /** Map of account names to account IDs (typically from Organizations stack) */
  accountIds?: Record<string, string>;
}

/**
 * Reusable stack for AWS Identity Center in management accounts
 *
 * This stack creates AWS Identity Center infrastructure including:
 * - Permission sets with managed policies and inline policies
 * - Account assignments linking users/groups to permission sets
 * - SSM parameters for Identity Center metadata
 *
 * The stack follows the single-construct pattern where it wraps
 * IdentityCenterConstruct with minimal business logic.
 *
 * @example
 * ```typescript
 * const identityStack = new ManagementIdentityCenterStack(stage, 'IdentityCenter', {
 *   managementConfig: config,
 *   config: manifest,
 *   accountIds: organizationsStack.accountIds,
 * });
 * ```
 */
export class ManagementIdentityCenterStack extends ManagementBaseStack {
  /** The Identity Center construct */
  public readonly identityCenter: IdentityCenterConstruct;

  constructor(scope: Construct, id: string, props: ManagementIdentityCenterStackProps) {
    super(scope, id, 'Identity-Center', props);

    const { identityCenter } = props.config;

    // Validate that Identity Center is enabled
    if (!identityCenter?.enabled) {
      throw new Error(
        'Identity Center must be enabled in manifest configuration to use this stack',
      );
    }

    // Create the Identity Center construct
    this.identityCenter = new IdentityCenterConstruct(this, 'IdentityCenter', {
      naming: this.naming,
      instanceArn: identityCenter.instanceArn,
      permissionSets: identityCenter.permissionSets,
      assignments: identityCenter.assignments,
      accountIds: props.accountIds,
      owner: props.config.options?.defaultTags?.Owner || props.config.company,
      company: props.config.company,
    });
  }

  /**
   * Get permission sets from the Identity Center construct
   */
  public get permissionSets() {
    return this.identityCenter.permissionSets;
  }

  /**
   * Get assignments from the Identity Center construct
   */
  public get assignments() {
    return this.identityCenter.assignments;
  }

  /**
   * Get the Identity Center instance ARN
   */
  public get instanceArn(): string {
    return this.identityCenter.instanceArn;
  }

  /**
   * Check if Identity Center is enabled in this stack
   */
  public get isEnabled(): boolean {
    return true; // Always enabled if stack is instantiated
  }
}
