/**
 * VPC Origin Stack for Customization
 *
 * Creates a CloudFront VPC Origin that connects to the internal ALB.
 * This enables CloudFront to route traffic to private ALBs without exposing them to the internet.
 *
 * This stack is deployed by customization-aws.
 */

import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as ram from 'aws-cdk-lib/aws-ram';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Props for VpcOriginStack
 */
export interface VpcOriginStackProps extends BaseStackProps {
  alb: elbv2.IApplicationLoadBalancer;
  /**
   * Management account ID for cross-account sharing
   */
  managementAccountId: string;
}

/**
 * VPC Origin Stack
 *
 * Creates a CloudFront VPC Origin and shares it with the management account.
 */
export class VpcOriginStack extends BaseStack {
  public readonly vpcOrigin: cloudfront.CfnVpcOrigin;
  public readonly vpcOriginId: string;

  constructor(scope: Construct, id: string, props: VpcOriginStackProps) {
    super(scope, id, 'VpcOrigin', props);

    const stackConfig = this.getStackConfig();

    // Create VPC Origin
    this.vpcOrigin = new cloudfront.CfnVpcOrigin(this, 'VpcOrigin', {
      vpcOriginEndpointConfig: {
        name: this.naming.resourceName('vpc-origin'),
        arn: props.alb.loadBalancerArn,
        httpPort: 80,
        httpsPort: 443,
        originProtocolPolicy: 'http-only',
        originSslProtocols: ['TLSv1.2'],
      },
      tags: [
        { key: 'Environment', value: stackConfig.environment },
        { key: 'Project', value: stackConfig.project },
        { key: 'Company', value: stackConfig.company },
      ],
    });

    this.vpcOriginId = this.vpcOrigin.attrId;

    // Share VPC Origin with management account via RAM
    new ram.CfnResourceShare(this, 'VpcOriginShare', {
      name: this.naming.resourceName('vpc-origin-share'),
      principals: [props.managementAccountId],
      resourceArns: [this.vpcOrigin.attrArn],
      allowExternalPrincipals: false,
    });

    // Export via SSM
    const ssmPrefix = `/codeiqlabs/saas/${stackConfig.environment}`;
    new ssm.StringParameter(this, 'SsmVpcOriginId', {
      parameterName: `${ssmPrefix}/vpc-origin/id`,
      stringValue: this.vpcOriginId,
      description: `VPC Origin ID for ${stackConfig.environment} environment`,
    });
    new ssm.StringParameter(this, 'SsmVpcOriginArn', {
      parameterName: `${ssmPrefix}/vpc-origin/arn`,
      stringValue: this.vpcOrigin.attrArn,
      description: `VPC Origin ARN for ${stackConfig.environment} environment`,
    });

    // Share SSM parameters with management account via RAM
    // This enables cross-account SSM parameter access (AWS feature released Feb 2024)
    new ram.CfnResourceShare(this, 'SsmParameterShare', {
      name: this.naming.resourceName('vpc-origin-ssm-share'),
      principals: [props.managementAccountId],
      resourceArns: [
        `arn:aws:ssm:${stackConfig.region}:${stackConfig.accountId}:parameter${ssmPrefix}/vpc-origin/id`,
        `arn:aws:ssm:${stackConfig.region}:${stackConfig.accountId}:parameter${ssmPrefix}/vpc-origin/arn`,
      ],
      allowExternalPrincipals: false,
    });

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'VpcOriginId', {
      value: this.vpcOriginId,
      exportName: this.naming.exportName('vpc-origin-id'),
      description: 'VPC Origin ID',
    });
    new cdk.CfnOutput(this, 'VpcOriginArn', {
      value: this.vpcOrigin.attrArn,
      exportName: this.naming.exportName('vpc-origin-arn'),
      description: 'VPC Origin ARN',
    });
  }
}
