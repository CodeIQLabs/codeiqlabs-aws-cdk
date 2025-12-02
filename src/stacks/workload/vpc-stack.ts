/**
 * VPC Stack for Workload Infrastructure
 *
 * Creates a VPC with public, private, and isolated subnets for workload accounts.
 * Designed for ECS Fargate services with ALB in public subnets and tasks in private subnets.
 *
 * Architecture:
 * - Public subnets: ALB, NAT Gateway
 * - Private subnets: ECS Fargate tasks (with NAT egress)
 * - Isolated subnets: RDS, ElastiCache (no internet access)
 *
 * @example
 * ```typescript
 * new VpcStack(app, 'VPC', {
 *   stackConfig: {
 *     project: 'CodeIQLabs-SaaS',
 *     environment: 'nprd',
 *     region: 'us-east-1',
 *     accountId: '466279485605',
 *     owner: 'CodeIQLabs',
 *     company: 'CodeIQLabs',
 *   },
 *   vpcConfig: {
 *     cidr: '10.0.0.0/16',
 *     maxAzs: 2,
 *     natGateways: 1,
 *     enableFlowLogs: true,
 *   },
 * });
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * VPC configuration options
 */
export interface VpcConfig {
  /**
   * CIDR block for the VPC
   * @default '10.0.0.0/16'
   */
  cidr?: string;

  /**
   * Maximum number of Availability Zones to use
   * @default 2
   */
  maxAzs?: number;

  /**
   * Number of NAT Gateways to create
   * Set to 0 for cost savings in non-prod (tasks won't have internet egress)
   * Set to maxAzs for high availability in prod
   * @default 1
   */
  natGateways?: number;

  /**
   * Enable VPC Flow Logs to CloudWatch
   * @default true
   */
  enableFlowLogs?: boolean;

  /**
   * Flow logs retention period in days
   * @default 30
   */
  flowLogsRetentionDays?: number;
}

/**
 * Props for VpcStack
 */
export interface VpcStackProps extends BaseStackProps {
  /**
   * VPC configuration
   */
  vpcConfig?: VpcConfig;
}

/**
 * VPC Stack for workload infrastructure
 *
 * Creates a production-ready VPC with:
 * - Public subnets for ALB and NAT Gateway
 * - Private subnets for ECS Fargate tasks
 * - Isolated subnets for databases
 * - VPC Flow Logs for security monitoring
 */
export class VpcStack extends BaseStack {
  /**
   * The VPC created by this stack
   */
  public readonly vpc: ec2.IVpc;

  /**
   * Security group for ALB
   */
  public readonly albSecurityGroup: ec2.ISecurityGroup;

  /**
   * Security group for ECS tasks
   */
  public readonly ecsSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, 'VPC', props);

    const config = props.vpcConfig ?? {};
    const cidr = config.cidr ?? '10.0.0.0/16';
    const maxAzs = config.maxAzs ?? 2;
    const natGateways = config.natGateways ?? 1;
    const enableFlowLogs = config.enableFlowLogs ?? true;
    const flowLogsRetentionDays = config.flowLogsRetentionDays ?? 30;

    // Create VPC with public, private, and isolated subnets
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
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // Create VPC Flow Logs
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

    // Create ALB Security Group
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: this.naming.resourceName('alb-sg'),
      description: 'Security group for Application Load Balancer',
      allowAllOutbound: true,
    });

    // Allow inbound HTTPS from anywhere (CloudFront will be the only client)
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from anywhere',
    );

    // Allow inbound HTTP for health checks and redirects
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP from anywhere',
    );

    // Create ECS Security Group
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: this.naming.resourceName('ecs-sg'),
      description: 'Security group for ECS Fargate tasks',
      allowAllOutbound: true,
    });

    // Allow inbound from ALB security group
    this.ecsSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow traffic from ALB on port 3000',
    );

    // Export VPC ID for cross-stack references
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      exportName: this.naming.exportName('vpc-id'),
      description: 'VPC ID',
    });

    // Export ALB Security Group ID
    new cdk.CfnOutput(this, 'AlbSecurityGroupId', {
      value: this.albSecurityGroup.securityGroupId,
      exportName: this.naming.exportName('alb-sg-id'),
      description: 'ALB Security Group ID',
    });

    // Export ECS Security Group ID
    new cdk.CfnOutput(this, 'EcsSecurityGroupId', {
      value: this.ecsSecurityGroup.securityGroupId,
      exportName: this.naming.exportName('ecs-sg-id'),
      description: 'ECS Security Group ID',
    });
  }
}
