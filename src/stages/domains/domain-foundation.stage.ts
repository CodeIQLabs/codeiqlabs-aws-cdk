import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { ManifestConfig, BaseStageProps } from '../../application/types';
import { RootDomainStack } from '../../stacks/domains/root-domain-stack';
import { DomainDelegationStack } from '../../stacks/domains/domain-delegation-stack';
import { AcmAndWafStack } from '../../stacks/domains/acm-waf-stack';

export interface DomainFoundationStageProps extends BaseStageProps {
  cfg: ManifestConfig;
}

/**
 * Stage 1: DomainFoundationStage
 *
 * Owns all Management-side, workload-independent domain infrastructure:
 * - Route53 public hosted zones for all brands
 * - ACM certificates (apex + wildcard) in us-east-1
 * - WAF Web ACLs (to be added) for prod/nprd
 */
export class DomainFoundationStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: DomainFoundationStageProps) {
    super(scope, id, props);

    const { cfg } = props;

    const deploymentAccountId = cfg.deployment.accountId;
    const deploymentRegion = cfg.deployment.region;

    const stackConfig = {
      project: cfg.project,
      environment: 'mgmt',
      region: deploymentRegion,
      accountId: deploymentAccountId,
      owner: cfg.company,
      company: cfg.company,
    };

    const primaryEnv = {
      account: deploymentAccountId,
      region: deploymentRegion,
    };

    // 1. Root hosted zones
    const rootDomainStack = new RootDomainStack(this, 'RootDomain', {
      stackConfig,
      config: cfg as any,
      env: primaryEnv,
    });

    // 2. Certificates (+ future WAF) in us-east-1
    const cloudFrontEnv = {
      account: deploymentAccountId,
      region: 'us-east-1',
    };

    const acmAndWafStack = new AcmAndWafStack(this, 'AcmAndWaf', {
      stackConfig: {
        ...stackConfig,
        region: 'us-east-1',
      },
      config: cfg as any,
      env: cloudFrontEnv,
    });

    acmAndWafStack.addDependency(rootDomainStack);

    // 3. Domain delegation (if configured)
    const hasDelegations = (cfg.domains as any)?.registeredDomains?.some(
      (domain: any) => domain.delegations?.length > 0,
    );

    if (hasDelegations) {
      const delegationStack = new DomainDelegationStack(this, 'DomainDelegation', {
        stackConfig,
        config: cfg as any,
        env: primaryEnv,
      });

      delegationStack.addDependency(rootDomainStack);
    }
  }
}
