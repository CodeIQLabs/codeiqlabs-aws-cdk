/**
 * Management Organizations Stack for AWS Organizations
 *
 * This module provides a reusable stack class for AWS Organizations setup
 * in management accounts. It follows the BaseStack + L2 Construct pattern
 * and can be used across any CodeIQLabs management account setup.
 */

import { Construct } from 'constructs';
import { ManagementBaseStack, ManagementBaseStackProps } from '../base/management-base';
import { OrganizationConstruct } from '../../constructs/organizations/constructs';
import type { ManagementAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Props for ManagementOrganizationsStack
 */
export interface ManagementOrganizationsStackProps extends ManagementBaseStackProps {
  /** The complete management manifest configuration */
  config: ManagementAppConfig;
  /** The organization root ID */
  orgRootId: string;
}

/**
 * Reusable stack for AWS Organizations in management accounts
 *
 * This stack creates AWS Organizations infrastructure including:
 * - Organization (if in create mode) or adoption (if in adopt mode)
 * - Organizational Units with proper hierarchy
 * - AWS Accounts within organizational units
 * - SSM parameters for organization metadata
 *
 * The stack follows the single-construct pattern where it wraps
 * OrganizationConstruct with minimal business logic.
 *
 * @example
 * ```typescript
 * const orgStack = new ManagementOrganizationsStack(stage, 'Organizations', {
 *   managementConfig: config,
 *   config: manifest,
 *   orgRootId: manifest.organization.rootId,
 * });
 * ```
 */
export class ManagementOrganizationsStack extends ManagementBaseStack {
  /** The Organization construct - undefined if organizations not enabled */
  public readonly organizationConstruct?: OrganizationConstruct;

  constructor(scope: Construct, id: string, props: ManagementOrganizationsStackProps) {
    super(scope, id, 'Organizations', props);

    const { organization } = props.config;

    // Only create organization construct if enabled
    if (organization?.enabled) {
      this.organizationConstruct = new OrganizationConstruct(this, 'Organization', {
        naming: this.naming,
        mode: organization.mode,
        rootId: props.orgRootId,
        organizationalUnits: organization.organizationalUnits,
        featureSet: organization.featureSet,
      });
    }
  }

  /**
   * Get account IDs from the organization construct
   * Returns empty object if organizations not enabled
   */
  public get accountIds(): Record<string, string> {
    return this.organizationConstruct?.accountIds || {};
  }

  /**
   * Get the organization resource
   * Returns undefined if organizations not enabled
   */
  public get organization() {
    return this.organizationConstruct?.organization;
  }

  /**
   * Get organizational units
   * Returns empty object if organizations not enabled
   */
  public get organizationalUnits() {
    return this.organizationConstruct?.organizationalUnits || {};
  }

  /**
   * Check if organizations is enabled in this stack
   */
  public get isEnabled(): boolean {
    return this.organizationConstruct !== undefined;
  }
}
