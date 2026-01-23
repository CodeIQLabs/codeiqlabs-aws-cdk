import { Construct } from 'constructs';
import { CfnOutput, Duration, Fn } from 'aws-cdk-lib';
import { IHostedZone, HostedZone, NsRecord } from 'aws-cdk-lib/aws-route53';
import { BaseStack, type BaseStackProps } from '../base/base-stack';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Origin Zone Delegation Stack
 *
 * Creates NS delegation records in the management account's hosted zones
 * to delegate origin sub-zones to workload accounts.
 *
 * **Architecture:**
 * - Management account owns: savvue.com, timisly.com, etc.
 * - Management creates NS delegation: origin-{env}.{brand} → workload NS
 * - Workload account owns: origin-{env}.{brand} hosted zone
 * - Workload creates Alias: {service}.origin-{env}.{brand} → ALB
 *
 * **Benefits:**
 * - No cross-account SSM lookups for ALB DNS
 * - No custom resources
 * - No drift (all CDK-owned)
 * - ALB replacement is painless (Route53 alias updates in workload)
 *
 * **Deployment Order:**
 * 1. Workload deploys OriginHostedZoneStack (creates origin-{env}.{brand} zone)
 * 2. Copy NS values from workload to management manifest
 * 3. Management deploys this stack (creates NS delegation)
 * 4. DNS resolution works: {service}.origin-{env}.{brand} → ALB
 */

export interface OriginZoneDelegationStackProps extends BaseStackProps {
  /** Unified application configuration from manifest */
  config: UnifiedAppConfig;
}

export class OriginZoneDelegationStack extends BaseStack {
  private delegationIndex = 0;

  constructor(scope: Construct, id: string, props: OriginZoneDelegationStackProps) {
    super(scope, id, 'OriginZoneDelegation', props);

    const domainConfig = (props.config as any).domains;
    if (!domainConfig?.enabled || !domainConfig.registeredDomains?.length) {
      throw new Error('Domain configuration is required for OriginZoneDelegationStack');
    }

    const delegation = domainConfig.originZoneDelegation;
    if (!delegation?.enabled) {
      return;
    }

    // Process each registered domain
    domainConfig.registeredDomains.forEach((domain: any) => {
      this.processDomain(domain, delegation.environments);
    });
  }

  private processDomain(domain: any, _environments: Record<string, any>): void {
    const parentDomain = domain.name;

    // Check if this domain has origin zone config
    // Domains without originZones are skipped (e.g., marketing-only domains)
    const originZones = domain.originZones;
    if (!originZones) {
      return;
    }

    // Import the parent hosted zone
    const hostedZone = this.importHostedZone(parentDomain);

    // Create NS delegation for each environment that has NS values configured
    Object.entries(originZones).forEach(([env, zoneConfig]: [string, any]) => {
      if (zoneConfig?.nameServers?.length > 0) {
        this.createNsDelegation(parentDomain, env, zoneConfig.nameServers, hostedZone);
      }
    });
  }

  private createNsDelegation(
    parentDomain: string,
    env: string,
    nameServers: string[],
    hostedZone: IHostedZone,
  ): void {
    const subZone = `origin-${env}.${parentDomain}`;
    const index = this.delegationIndex++;
    const sanitizedSubZone = this.sanitizeDomainName(subZone);

    // Create NS record delegating to workload's hosted zone
    new NsRecord(this, `NsDelegation${index}`, {
      zone: hostedZone,
      recordName: `origin-${env}`,
      values: nameServers,
      ttl: Duration.hours(1),
      comment: `NS delegation for ${subZone} to workload account`,
    });

    new CfnOutput(this, `${sanitizedSubZone}Delegated`, {
      value: `${subZone} -> ${nameServers.join(', ')}`,
      description: `NS delegation for ${subZone}`,
      exportName: this.naming.exportName(`${sanitizedSubZone}-ns-delegation`),
    });
  }

  private importHostedZone(domainName: string): IHostedZone {
    const sanitized = this.sanitizeDomainName(domainName);
    const hostedZoneId = Fn.importValue(this.naming.exportName(`${sanitized}-hosted-zone-id`));

    return HostedZone.fromHostedZoneAttributes(this, `ImportedZone${sanitized}`, {
      hostedZoneId,
      zoneName: domainName,
    });
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
