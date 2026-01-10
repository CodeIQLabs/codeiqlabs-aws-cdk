/**
 * ECS Cluster Stack for Workload Infrastructure
 *
 * Creates an ECS cluster with Container Insights enabled for monitoring.
 * This cluster is shared across all services (marketing sites, API) in an environment.
 *
 * @example
 * ```typescript
 * new EcsClusterStack(app, 'ECS-Cluster', {
 *   stackConfig: {
 *     project: 'CodeIQLabs-SaaS',
 *     environment: 'nprd',
 *     region: 'us-east-1',
 *     accountId: '466279485605',
 *     owner: 'CodeIQLabs',
 *     company: 'CodeIQLabs',
 *   },
 *   vpc: vpcStack.vpc,
 *   clusterConfig: {
 *     enableContainerInsights: true,
 *   },
 * });
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * ECS Cluster configuration options
 */
export interface EcsClusterConfig {
  /**
   * Enable Container Insights for enhanced monitoring
   * @default true
   */
  enableContainerInsights?: boolean;
}

/**
 * Props for EcsClusterStack
 */
export interface EcsClusterStackProps extends BaseStackProps {
  /**
   * VPC where the cluster will be created.
   * If not provided, will be imported from SSM using convention:
   * /codeiqlabs/saas/{env}/vpc/id
   */
  vpc?: ec2.IVpc;

  /**
   * ECS Cluster configuration
   */
  clusterConfig?: EcsClusterConfig;
}

/**
 * ECS Cluster Stack for workload infrastructure
 *
 * Creates a shared ECS cluster for all Fargate services in an environment.
 * Container Insights is enabled by default for monitoring.
 */
export class EcsClusterStack extends BaseStack {
  /**
   * The ECS cluster created by this stack
   */
  public readonly cluster: ecs.ICluster;

  constructor(scope: Construct, id: string, props: EcsClusterStackProps) {
    super(scope, id, 'ECSCluster', props);

    const config = props.clusterConfig ?? {};
    const enableContainerInsights = config.enableContainerInsights ?? true;
    const envName = this.getStackConfig().environment;

    // SSM parameter prefix for importing from customization-aws
    const ssmPrefix = `/codeiqlabs/saas/${envName}`;

    // Import VPC from SSM if not provided
    const vpc =
      props.vpc ??
      ec2.Vpc.fromLookup(this, 'ImportedVpc', {
        vpcId: ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/vpc/id`),
      });

    // Create ECS Cluster
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: this.naming.resourceName('cluster'),
      vpc,
      containerInsightsV2: enableContainerInsights
        ? ecs.ContainerInsights.ENHANCED
        : ecs.ContainerInsights.DISABLED,
    });

    // Export cluster ARN to SSM for CI/CD access
    new ssm.StringParameter(this, 'ClusterArnParameter', {
      parameterName: `${ssmPrefix}/ecs/cluster-arn`,
      stringValue: this.cluster.clusterArn,
      description: 'ECS Cluster ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export cluster name to SSM for CI/CD access
    new ssm.StringParameter(this, 'ClusterNameParameter', {
      parameterName: `${ssmPrefix}/ecs/cluster-name`,
      stringValue: this.cluster.clusterName,
      description: 'ECS Cluster Name',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export cluster ARN for cross-stack references
    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      exportName: this.naming.exportName('cluster-arn'),
      description: 'ECS Cluster ARN',
    });

    // Export cluster name
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      exportName: this.naming.exportName('cluster-name'),
      description: 'ECS Cluster Name',
    });
  }
}
