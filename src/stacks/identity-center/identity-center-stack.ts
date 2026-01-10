/**
 * Management Identity Center Stack for AWS Identity Center (SSO)
 *
 * This module provides a reusable stack class for AWS Identity Center setup
 * in management accounts. It follows the BaseStack + L2 Construct pattern
 * and can be used across any CodeIQLabs management account setup.
 */

import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base/base-stack';
import { IdentityCenterConstruct } from '../../constructs/identity-center/constructs';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Props for ManagementIdentityCenterStack
 */
export interface ManagementIdentityCenterStackProps extends BaseStackProps {
  /** The complete manifest configuration */
  config: UnifiedAppConfig;
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
 *   stackConfig: {
 *     project: 'CodeIQLabs',
 *     environment: 'mgmt',
 *     region: 'us-east-1',
 *     accountId: '682475224767',
 *     owner: 'CodeIQLabs',
 *     company: 'CodeIQLabs',
 *   },
 *   config: manifest,
 *   accountIds: organizationsStack.accountIds,
 * });
 * ```
 */
export class ManagementIdentityCenterStack extends BaseStack {
  /** The Identity Center construct */
  public readonly identityCenter: IdentityCenterConstruct;

  constructor(scope: Construct, id: string, props: ManagementIdentityCenterStackProps) {
    super(scope, id, 'IdentityCenter', props);

    const { identityCenter } = props.config;

    // Validate that Identity Center config is present (presence implies enabled)
    if (!identityCenter) {
      throw new Error('Identity Center must be configured in manifest to use this stack');
    }

    // Validate required tags
    if (!identityCenter.tags?.Owner) {
      throw new Error('Identity Center configuration must include tags.Owner');
    }
    if (!identityCenter.tags?.ManagedBy) {
      throw new Error('Identity Center configuration must include tags.ManagedBy');
    }

    // Create the Identity Center construct
    this.identityCenter = new IdentityCenterConstruct(this, 'IdentityCenter', {
      naming: this.naming,
      instanceArn: identityCenter.instanceArn,
      identityStoreId: identityCenter.identityStoreId,
      users: identityCenter.users,
      permissionSets: identityCenter.permissionSets,
      assignments: identityCenter.assignments,
      accountIds: props.accountIds,
      owner: identityCenter.tags.Owner,
      company: props.config.naming.company,
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
