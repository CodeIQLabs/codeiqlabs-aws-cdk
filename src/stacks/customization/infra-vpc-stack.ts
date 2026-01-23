/**
 * Infrastructure VPC Stack for Customization
 *
 * Creates a VPC with security groups for ALB and ECS tasks.
 * Exports VPC and security group IDs via SSM parameters for cross-stack references.
 *
 * This stack is deployed by customization-aws and consumed by saas-aws.
 */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * VPC configuration options
 */
export interface InfraVpcConfig {
  cidr?: string;
  maxAzs?: number;
  natGateways?: number;
  enableFlowLogs?: boolean;
  flowLogsRetentionDays?: number;
}

/**
 * Props for InfraVpcStack
 */
export interface InfraVpcStackProps extends BaseStackProps {
  vpcConfig?: InfraVpcConfig;
}

/**
 * Infrastructure VPC Stack
 *
 * Creates VPC with security groups and exports via SSM for saas-aws consumption.
 */
export class InfraVpcStack extends BaseStack {
  public readonly vpc: ec2.IVpc;
  public readonly albSecurityGroup: ec2.ISecurityGroup;
  public readonly ecsSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: InfraVpcStackProps) {
    super(scope, id, 'Vpc', props);

    const config = props.vpcConfig ?? {};
    const cidr = config.cidr ?? '10.0.0.0/16';
    const maxAzs = config.maxAzs ?? 2;
    const natGateways = config.natGateways ?? 1;
    const enableFlowLogs = config.enableFlowLogs ?? true;
    const flowLogsRetentionDays = config.flowLogsRetentionDays ?? 30;
    const stackConfig = this.getStackConfig();

    // Create VPC
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: this.naming.resourceName('vpc'),
      ipAddresses: ec2.IpAddresses.cidr(cidr),
      maxAzs,
      natGateways,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
          mapPublicIpOnLaunch: false,
        },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // VPC Flow Logs
    if (enableFlowLogs) {
      const flowLogsLogGroup = new logs.LogGroup(this, 'FlowLogsLogGroup', {
        logGroupName: `/aws/vpc/${this.naming.resourceName('vpc')}/flow-logs`,
        retention: flowLogsRetentionDays,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
      const flowLogsRole = new iam.Role(this, 'FlowLogsRole', {
        roleName: this.naming.iamRoleName('vpc-flow-logs'),
        assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
      });
      flowLogsLogGroup.grantWrite(flowLogsRole);
      new ec2.FlowLog(this, 'FlowLog', {
        resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
        destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogsLogGroup, flowLogsRole),
        trafficType: ec2.FlowLogTrafficType.ALL,
      });
    }

    // ALB Security Group (internet-facing)
    // Note: CloudFront prefix list (pl-3b927c52) exceeds security group rule limits
    // Using anyIpv4() instead - CloudFront will be the only client via DNS/routing
    // Additional security via WAF rules on CloudFront distributions
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: this.naming.resourceName('alb-sg'),
      description: 'Security group for Internet-Facing ALB',
      allowAllOutbound: true,
    });

    // Allow inbound HTTPS from anywhere
    // CloudFront will be the only client in practice (via origin domain routing)
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from anywhere (CloudFront via origin domain)',
    );

    // Allow inbound HTTP (for health checks and redirects)
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP from anywhere (health checks)',
    );

    // ECS Security Group
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: this.naming.resourceName('ecs-sg'),
      description: 'Security group for ECS Fargate tasks',
      allowAllOutbound: true,
    });
    this.ecsSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow traffic from ALB on port 3000',
    );

    // Export via SSM
    new ssm.StringParameter(this, 'SsmVpcId', {
      parameterName: this.naming.ssmParameterName('vpc', 'id'),
      stringValue: this.vpc.vpcId,
      description: `VPC ID for ${stackConfig.environment} environment`,
    });
    new ssm.StringParameter(this, 'SsmPrivateSubnetIds', {
      parameterName: this.naming.ssmParameterName('vpc', 'private-subnet-ids'),
      stringValue: this.vpc.privateSubnets.map((s) => s.subnetId).join(','),
      description: `Private subnet IDs for ${stackConfig.environment} environment`,
    });
    new ssm.StringParameter(this, 'SsmPublicSubnetIds', {
      parameterName: this.naming.ssmParameterName('vpc', 'public-subnet-ids'),
      stringValue: this.vpc.publicSubnets.map((s) => s.subnetId).join(','),
      description: `Public subnet IDs for ${stackConfig.environment} environment`,
    });
    new ssm.StringParameter(this, 'SsmIsolatedSubnetIds', {
      parameterName: this.naming.ssmParameterName('vpc', 'isolated-subnet-ids'),
      stringValue: this.vpc.isolatedSubnets.map((s) => s.subnetId).join(','),
      description: `Isolated subnet IDs for ${stackConfig.environment} environment`,
    });
    new ssm.StringParameter(this, 'SsmAlbSecurityGroupId', {
      parameterName: this.naming.ssmParameterName('alb', 'security-group-id'),
      stringValue: this.albSecurityGroup.securityGroupId,
      description: `ALB Security Group ID for ${stackConfig.environment} environment`,
    });
    new ssm.StringParameter(this, 'SsmEcsSecurityGroupId', {
      parameterName: this.naming.ssmParameterName('vpc', 'ecs-security-group-id'),
      stringValue: this.ecsSecurityGroup.securityGroupId,
      description: `ECS Security Group ID for ${stackConfig.environment} environment`,
    });
  }
}
