/**
 * Identity Center SSO Infrastructure Stage
 *
 * This stage creates Identity Center SSO infrastructure including
 * permission sets and account assignments.
 */

import type { Construct } from 'constructs';
import { ManagementBaseStage } from '../base/management-base-stage';
import { ManagementIdentityCenterStack } from '../../stacks/management/identity-center-stack';
import type { EnhancedManagementStageProps } from '../stage-types';

/**
 * Stage for Identity Center SSO infrastructure
 *
 * Creates:
 * - Identity Center permission sets
 * - Account assignments
 * - User/group mappings
 */
export class IdentityCenterStage extends ManagementBaseStage {
  constructor(scope: Construct, id: string, props: EnhancedManagementStageProps) {
    super(scope, id, props);

    // Create Identity Center infrastructure stack
    this.createStack(ManagementIdentityCenterStack, 'IdentityCenter');
  }
}
