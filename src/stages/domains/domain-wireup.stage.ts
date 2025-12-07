import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { ManifestConfig, BaseStageProps } from '../../application/types';
import { DnsRecordsStack } from '../../stacks/domains/dns-records-stack';
import { CloudFrontDistributionStack } from '../../stacks/domains/cloudfront-distribution-stack';

export interface DomainWireupStageProps extends BaseStageProps {
  cfg: ManifestConfig;
}

/**
 * Stage 2: DomainWireupStage
 *
 * Owns everything that depends on workload ALBs existing:
 * - CloudFront distributions per subdomain
 * - ALB DNS lookup custom resources (future)
 * - Route53 records (A/AAAA ALIAS) pointing to CloudFront
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

    const cloudFrontStack = new CloudFrontDistributionStack(this, 'CloudFrontDistributions', {
      stackConfig: {
        ...stackConfig,
        region: 'us-east-1',
      },
      config: cfg as any,
      env: cloudFrontEnv,
    });

    // DNS records
    const dnsRecordsStack = new DnsRecordsStack(this, 'DnsRecords', {
      stackConfig,
      config: cfg as any,
      env: primaryEnv,
    });

    dnsRecordsStack.addDependency(cloudFrontStack);
  }
}
