/**
 * Static Website Hosting Infrastructure Stage
 *
 * This stage creates static website hosting infrastructure including
 * S3 buckets, CloudFront distributions, and custom domain setup.
 */

import type { Construct } from 'constructs';
import { WorkloadBaseStage } from '../base/workload-base-stage';
import { StaticHostingDomainStack } from '../../stacks/workload/static-hosting-domain-stack';
import { StaticHostingFrontendStack } from '../../stacks/workload/static-hosting-frontend-stack';
import type { EnhancedWorkloadStageProps } from '../stage-types';

/**
 * Stage for static website hosting infrastructure
 *
 * Creates:
 * - Route53 hosted zone and SSL certificate (domain stack)
 * - S3 bucket and CloudFront distribution (frontend stack)
 * - Custom domain configuration
 */
export class StaticHostingStage extends WorkloadBaseStage {
  constructor(scope: Construct, id: string, props: EnhancedWorkloadStageProps) {
    super(scope, id, props);

    // Create domain infrastructure first (Route53 + ACM)
    const domainResult = this.createStack(StaticHostingDomainStack, 'Domain');

    // Create frontend infrastructure (S3 + CloudFront)
    this.createStack(StaticHostingFrontendStack, 'Frontend', {
      dependencies: [domainResult.stack],
    });
  }
}
