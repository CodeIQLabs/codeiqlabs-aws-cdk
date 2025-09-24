/**
 * Static Hosting Domain Stack
 *
 * This stack creates domain and SSL certificate infrastructure for static hosting:
 * - Route53 hosted zone for subdomain management
 * - ACM SSL certificate with DNS validation
 * - Cross-account domain delegation support
 * - Standardized naming and tagging
 *
 * This stack follows the single-construct pattern where it wraps
 * StaticHostingDomainConstruct with minimal business logic.
 */

import { Construct } from 'constructs';
import { WorkloadBaseStack, WorkloadBaseStackProps } from '../base/workload-base';
import { StaticHostingDomainConstruct } from '../../constructs/static-hosting/constructs';
import type {
  StaticHostingDomainConfig,
  StaticHostingDomainResult,
} from '../../constructs/static-hosting/types';
import type { WorkloadAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Props for StaticHostingDomainStack
 */
export interface StaticHostingDomainStackProps extends WorkloadBaseStackProps {
  /** The complete workload manifest configuration */
  config: WorkloadAppConfig;
  /** Environment name (nprd, prod, etc.) */
  environment: string;
  /** Environment-specific configuration */
  envConfig: any;
}

/**
 * Reusable stack for static hosting domain management
 *
 * This stack creates domain infrastructure including:
 * - Route53 hosted zone for the static hosting domain
 * - ACM SSL certificate with DNS validation
 * - SSM parameters for domain metadata
 * - CloudFormation outputs for cross-stack references
 *
 * The stack follows the single-construct pattern where it wraps
 * StaticHostingDomainConstruct with minimal business logic.
 *
 * @example
 * ```typescript
 * const domainStack = new StaticHostingDomainStack(stage, 'Domain', {
 *   config: manifest,
 *   environment: 'prod',
 *   envConfig: manifest.environments.prod.config,
 * });
 * ```
 */
export class StaticHostingDomainStack extends WorkloadBaseStack {
  /** The domain construct instance */
  public readonly domainConstruct: StaticHostingDomainConstruct;

  /** The hosted zone created by this stack */
  public readonly hostedZone: import('aws-cdk-lib/aws-route53').HostedZone;

  /** The SSL certificate created by this stack */
  public readonly certificate: import('aws-cdk-lib/aws-certificatemanager').Certificate;

  constructor(scope: Construct, id: string, props: StaticHostingDomainStackProps) {
    super(scope, id, 'Static-Hosting-Domain', {
      ...props,
      workloadConfig: {
        project: props.config.project,
        environment: props.environment,
        region: props.config.environments[props.environment].region || 'us-east-1',
        accountId: props.config.environments[props.environment].accountId,
        owner: props.config.company,
        company: props.config.company,
      },
    });

    const { config, environment, envConfig } = props;

    // Extract domain configuration from environment config
    const domainConfig = envConfig.domain;
    if (!domainConfig || !domainConfig.name) {
      throw new Error(
        `Domain configuration is required for static hosting. ` +
          `Please ensure environments.${environment}.config.domain.name is specified in your manifest.`,
      );
    }

    // Build domain configuration for the construct
    const staticHostingDomainConfig: StaticHostingDomainConfig = {
      domainName: domainConfig.name,
      parentDomain: domainConfig.parentDomain,
      parentHostedZoneId: domainConfig.parentHostedZoneId,
      alternativeDomainNames: domainConfig.alternativeDomainNames,
      certificateValidation: domainConfig.certificateValidation,
    };

    // Create the domain construct
    this.domainConstruct = new StaticHostingDomainConstruct(this, 'StaticHostingDomain', {
      naming: this.naming,
      environment,
      domainConfig: staticHostingDomainConfig,
      owner: config.company,
      company: config.company,
      customTags: {
        Project: config.project,
        Environment: environment,
        Component: 'static-hosting-domain',
      },
    });

    // Expose the created resources for other stacks
    this.hostedZone = this.domainConstruct.hostedZone;
    this.certificate = this.domainConstruct.certificate;
  }

  /**
   * Get the domain result for use by other stacks
   */
  public getDomainResult(): StaticHostingDomainResult {
    return this.domainConstruct.getResult();
  }
}
