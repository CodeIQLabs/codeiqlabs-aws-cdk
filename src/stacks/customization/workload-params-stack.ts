/**
 * Workload Parameters Stack for Customization
 *
 * Creates common SSM parameters in workload accounts that are useful for
 * cross-account lookups and configuration. This stack can be extended
 * to include additional common parameters in the future.
 *
 * Parameters created (when accountIds: true):
 * - /codeiqlabs/org/account-id - The workload account's own account ID
 * - /codeiqlabs/org/management-account-id - The management account ID
 *
 * Parameters created (when delegationRoleArns is provided):
 * - /codeiqlabs/route53/{domain}/delegation-role-arn - Cross-account delegation role ARN
 *
 * Values are derived from the environments section in the manifest.
 * This stack is deployed by customization-aws to workload accounts.
 */

import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Common parameters configuration
 */
export interface CommonParamsConfig {
  /**
   * Create SSM parameters for account IDs
   * When true, creates both account-id and management-account-id parameters
   * @default false
   */
  accountIds?: boolean;
}

/**
 * Props for WorkloadParamsStack
 */
export interface WorkloadParamsStackProps extends BaseStackProps {
  /**
   * Management account ID (from environments.mgmt.accountId)
   */
  managementAccountId: string;
  /**
   * Management account region (where delegation roles are created)
   * @default 'us-east-1'
   */
  managementRegion?: string;
  /**
   * Common parameters configuration
   */
  paramsConfig?: CommonParamsConfig;
  /**
   * Map of domain names to delegation role ARNs
   * These ARNs are constructed predictably based on domain name
   * @example { 'savvue.com': 'arn:aws:iam::123456789012:role/Route53-Delegation-savvue-com' }
   */
  delegationRoleArns?: Record<string, string>;
}

/**
 * Workload Parameters Stack
 *
 * Creates common SSM parameters in workload accounts for cross-account lookups.
 * Values are derived from the environments section in the manifest.
 */
export class WorkloadParamsStack extends BaseStack {
  public readonly accountIdParameter?: ssm.IStringParameter;
  public readonly managementAccountIdParameter?: ssm.IStringParameter;
  public readonly delegationRoleParameters: Map<string, ssm.IStringParameter> = new Map();

  constructor(scope: Construct, id: string, props: WorkloadParamsStackProps) {
    super(scope, id, 'WorkloadParams', props);

    const config = props.paramsConfig ?? {};
    const stackConfig = this.getStackConfig();
    const ssmPrefix = '/codeiqlabs/org';

    // Create account ID parameters when accountIds flag is true
    if (config.accountIds) {
      // SSM parameter for this account's own account ID
      this.accountIdParameter = new ssm.StringParameter(this, 'AccountIdParameter', {
        parameterName: `${ssmPrefix}/account-id`,
        stringValue: stackConfig.accountId,
        description: `Account ID for ${stackConfig.environment} environment`,
        tier: ssm.ParameterTier.STANDARD,
      });

      // SSM parameter for management account ID
      this.managementAccountIdParameter = new ssm.StringParameter(
        this,
        'ManagementAccountIdParameter',
        {
          parameterName: `${ssmPrefix}/management-account-id`,
          stringValue: props.managementAccountId,
          description: 'Management account ID for cross-account operations',
          tier: ssm.ParameterTier.STANDARD,
        },
      );

      // CloudFormation outputs
      new cdk.CfnOutput(this, 'AccountId', {
        value: stackConfig.accountId,
        exportName: this.naming.exportName('account-id'),
        description: 'This account ID',
      });

      new cdk.CfnOutput(this, 'ManagementAccountId', {
        value: props.managementAccountId,
        exportName: this.naming.exportName('management-account-id'),
        description: 'Management account ID',
      });
    }

    // Create delegation role ARN parameters
    if (props.delegationRoleArns) {
      let index = 0;
      for (const [domain, roleArn] of Object.entries(props.delegationRoleArns)) {
        const param = new ssm.StringParameter(this, `DelegationRoleArn${index}`, {
          parameterName: `/codeiqlabs/route53/${domain}/delegation-role-arn`,
          stringValue: roleArn,
          description: `Delegation role ARN for ${domain} subdomain delegation (cross-account)`,
          tier: ssm.ParameterTier.STANDARD,
        });

        this.delegationRoleParameters.set(domain, param);

        new cdk.CfnOutput(this, `DelegationRoleArn${index}Output`, {
          value: roleArn,
          description: `Delegation role ARN for ${domain}`,
          exportName: this.naming.exportName(`${domain.replace(/\./g, '-')}-delegation-role-arn`),
        });

        index++;
      }
    }
  }
}
