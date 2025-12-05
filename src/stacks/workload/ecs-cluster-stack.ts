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
   * VPC where the cluster will be created
   */
  vpc: ec2.IVpc;

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

    // Create ECS Cluster
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: this.naming.resourceName('cluster'),
      vpc: props.vpc,
      containerInsightsV2: enableContainerInsights
        ? ecs.ContainerInsights.ENHANCED
        : ecs.ContainerInsights.DISABLED,
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
