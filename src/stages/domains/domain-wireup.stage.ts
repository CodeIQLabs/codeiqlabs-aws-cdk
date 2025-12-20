import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { ManifestConfig, BaseStageProps } from '../../application/types';
import { DnsRecordsStack } from '../../stacks/domains/dns-records-stack';
import { CloudFrontDistributionStack } from '../../stacks/domains/cloudfront-distribution-stack';
import { OriginZoneDelegationStack } from '../../stacks/domains/origin-zone-delegation-stack';

export interface DomainWireupStageProps extends BaseStageProps {
  cfg: ManifestConfig;
}

/**
 * Stage 2: DomainWireupStage
 *
 * Owns everything that depends on workload infrastructure:
 * - Origin zone NS delegation (origin-{env}.{brand} → workload NS)
 * - CloudFront distributions per subdomain (using stable origin hostnames)
 * - Route53 records (A/AAAA ALIAS) pointing to CloudFront
 *
 * **Zone Delegation Architecture:**
 * 1. Workload creates: origin-{env}.{brand} hosted zone with Alias records to ALBs
 * 2. OriginZoneDelegationStack creates: NS delegation in parent zone
 * 3. CloudFrontDistributionStack uses: {service}.origin-{env}.{brand} as origin
 * 4. DnsRecordsStack creates: {subdomain}.{brand} → CloudFront
 *
 * This eliminates cross-account SSM lookups and custom resources.
 * ALB changes are handled entirely within the workload account.
 */
export class DomainWireupStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: DomainWireupStageProps) {
    super(scope, id, props);

    const { cfg } = props;

    const deploymentAccountId = cfg.deployment.accountId;
    const deploymentRegion = cfg.deployment.region;

    const stackConfig = {
      project: cfg.naming.project,
      environment: 'mgmt',
      region: deploymentRegion,
      accountId: deploymentAccountId,
      owner: cfg.naming.owner || cfg.naming.company,
      company: cfg.naming.company,
    };

    const primaryEnv = {
      account: deploymentAccountId,
      region: deploymentRegion,
    };

    // CloudFront distributions in us-east-1
    const cloudFrontEnv = {
      account: deploymentAccountId,
      region: 'us-east-1',
    };

    // Step 1: Create NS delegation for origin sub-zones
    // This delegates origin-{env}.{brand} to workload account's hosted zone
    const originDelegationStack = new OriginZoneDelegationStack(this, 'OriginZoneDelegation', {
      stackConfig,
      config: cfg as any,
      env: primaryEnv,
    });

    // Step 2: Create CloudFront distributions (using stable origin hostnames)
    // Origin hostnames: {service}.origin-{env}.{brand} (resolved via delegated zone)
    const cloudFrontStack = new CloudFrontDistributionStack(this, 'CloudFrontDistributions', {
      stackConfig: {
        ...stackConfig,
        region: 'us-east-1',
      },
      config: cfg as any,
      env: cloudFrontEnv,
    });

    // CloudFront depends on NS delegation existing
    cloudFrontStack.addDependency(originDelegationStack);

    // Step 3: Create DNS records ({subdomain}.{brand} → CloudFront)
    const dnsRecordsStack = new DnsRecordsStack(this, 'DnsRecords', {
      stackConfig,
      config: cfg as any,
      env: primaryEnv,
    });

    dnsRecordsStack.addDependency(cloudFrontStack);
  }
}
