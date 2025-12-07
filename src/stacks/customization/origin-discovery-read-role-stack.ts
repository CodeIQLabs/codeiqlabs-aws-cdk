import type { Construct } from 'constructs';
import { BaseStack, type BaseStackProps } from '../base';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface OriginDiscoveryReadRoleStackProps extends BaseStackProps {
  /** Management account ID (for IAM trust policy) */
  managementAccountId: string;
  /** SSM parameter path prefix to allow reading (derived from company name if not specified) */
  ssmParameterPathPrefix?: string;
}

/**
 * Origin Discovery Read Role Stack
 *
 * Creates an IAM role in workload accounts that allows the Management account's
 * Lambda function to read SSM parameters containing ALB DNS names for origin discovery.
 *
 * This role is part of the centralized domain architecture where:
 * - CloudFront distributions are in the Management account
 * - ALBs are in workload accounts
 * - The Management account's Lambda discovers ALB DNS names at deploy time
 *
 * Trust Policy: Allows the Management account to assume this role
 * Permissions: ssm:GetParameter on the specified SSM parameter path prefix
 *
 * SSM Parameter Path Pattern: /{company}/* (derived from manifest)
 *
 * @example
 * ```typescript
 * new OriginDiscoveryReadRoleStack(app, 'OriginDiscoveryReadRole', {
 *   stackConfig: { ... },
 *   managementAccountId: '682475224767',
 *   // ssmParameterPathPrefix defaults to /{company}/* based on stackConfig.company
 *   env: { account: '466279485605', region: 'us-east-1' },
 * });
 * ```
 */
export class OriginDiscoveryReadRoleStack extends BaseStack {
  /** The IAM role that can be assumed by the Management account */
  public readonly role: iam.Role;

  /** The ARN of the role */
  public readonly roleArn: string;

  constructor(scope: Construct, id: string, props: OriginDiscoveryReadRoleStackProps) {
    super(scope, id, 'OriginDiscoveryRead', props);

    // Derive default SSM prefix from company name in stack config
    const defaultSsmPrefix = `/${props.stackConfig.company.toLowerCase()}/*`;
    const { managementAccountId, ssmParameterPathPrefix = defaultSsmPrefix } = props;

    // Create the IAM role with trust policy for Management account
    this.role = new iam.Role(this, 'OriginDiscoveryReadRole', {
      roleName: 'OriginDiscoveryReadRole',
      description: 'Allows Management account Lambda to read SSM parameters for origin discovery',
      assumedBy: new iam.AccountPrincipal(managementAccountId),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Grant permission to read SSM parameters under the specified prefix
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowSSMParameterRead',
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:*:${cdk.Stack.of(this).account}:parameter${ssmParameterPathPrefix.replace('*', '')}*`,
        ],
      }),
    );

    this.roleArn = this.role.roleArn;

    // Export the role ARN for reference
    new cdk.CfnOutput(this, 'OriginDiscoveryReadRoleArn', {
      value: this.roleArn,
      description: 'ARN of the Origin Discovery Read Role',
      exportName: this.naming.exportName('OriginDiscoveryReadRoleArn'),
    });
  }
}
