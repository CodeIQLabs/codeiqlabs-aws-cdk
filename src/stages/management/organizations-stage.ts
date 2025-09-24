/**
 * AWS Organizations Infrastructure Stage
 *
 * This stage creates AWS Organizations infrastructure including
 * organizational units, accounts, and service control policies.
 */

import type { Construct } from 'constructs';
import { ManagementBaseStage } from '../base/management-base-stage';
import { ManagementOrganizationsStack } from '../../stacks/management/organizations-stack';
import type { EnhancedManagementStageProps } from '../stage-types';

/**
 * Stage for AWS Organizations infrastructure
 *
 * Creates:
 * - AWS Organizations setup
 * - Organizational Units (OUs)
 * - Member accounts
 * - Service Control Policies (SCPs)
 */
export class OrganizationsStage extends ManagementBaseStage {
  constructor(scope: Construct, id: string, props: EnhancedManagementStageProps) {
    super(scope, id, props);

    // Create Organizations infrastructure stack
    this.createStack(ManagementOrganizationsStack, 'Organizations');
  }
}
