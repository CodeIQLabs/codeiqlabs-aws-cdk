/**
 * Domain Authority Infrastructure Stage
 *
 * This stage creates domain authority infrastructure including
 * Route53 hosted zones and cross-account delegation setup.
 */

import type { Construct } from 'constructs';
import { ManagementBaseStage } from '../base/management-base-stage';
import { DomainDelegationStack } from '../../stacks/management/domain-delegation-stack';
import type { EnhancedManagementStageProps } from '../stage-types';

/**
 * Stage for domain authority infrastructure
 *
 * Creates:
 * - Route53 hosted zones for organization domains
 * - Cross-account delegation setup
 * - DNS management infrastructure
 */
export class DomainAuthorityStage extends ManagementBaseStage {
  constructor(scope: Construct, id: string, props: EnhancedManagementStageProps) {
    super(scope, id, props);

    // Create domain delegation infrastructure stack
    this.createStack(DomainDelegationStack, 'DomainDelegation');
  }
}
