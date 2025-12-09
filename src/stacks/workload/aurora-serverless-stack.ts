import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import type { AuroraConfig } from '@codeiqlabs/aws-utils';
import { BaseStack, BaseStackProps } from '../base';

export interface AuroraServerlessStackProps extends BaseStackProps {
  /**
   * VPC for the Aurora cluster (must include isolated subnets)
   */
  vpc: ec2.IVpc;

  /**
   * ECS security group used to allow ingress to the database
   */
  ecsSecurityGroup: ec2.ISecurityGroup;

  /**
   * Aurora configuration from manifest
   */
  config: AuroraConfig;
}

/**
 * Aurora Serverless v2 stack for multi-brand PostgreSQL databases
 *
 * Provisions a single Aurora PostgreSQL Serverless v2 cluster in isolated subnets.
 * The cluster is reachable only from ECS tasks via security group rules.
 */
export class AuroraServerlessStack extends BaseStack {
  public readonly cluster: rds.DatabaseCluster;
  public readonly securityGroup: ec2.ISecurityGroup;
  public readonly adminSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: AuroraServerlessStackProps) {
    super(scope, id, 'Aurora', props);

    const { config } = props;
    const stackConfig = this.getStackConfig();

    // Security group allowing ECS tasks to connect on 5432
    this.securityGroup = new ec2.SecurityGroup(this, 'AuroraSecurityGroup', {
      vpc: props.vpc,
      securityGroupName: this.naming.resourceName('aurora-sg'),
      description: 'Aurora PostgreSQL access from ECS tasks',
      allowAllOutbound: true,
    });

    this.securityGroup.addIngressRule(
      props.ecsSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow ECS tasks to access Aurora',
    );

    const engineVersion = this.resolveEngineVersion(config.engineVersion);
    const performanceInsightsRetention = this.resolvePerformanceInsightsRetention(
      config.performanceInsightsRetention,
    );

    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      clusterIdentifier: this.naming.resourceName('aurora'),
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: engineVersion,
      }),
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        enablePerformanceInsights: config.performanceInsights,
        performanceInsightRetention: performanceInsightsRetention,
        publiclyAccessible: false,
      }),
      serverlessV2MinCapacity: config.minCapacity,
      serverlessV2MaxCapacity: config.maxCapacity,
      defaultDatabaseName: config.databases[0] ?? 'core',
      credentials: rds.Credentials.fromGeneratedSecret('postgres', {
        // Secret naming follows the manifest-driven pattern: {project}/{env}/{key}
        secretName: `${stackConfig.project.toLowerCase()}/${stackConfig.environment}/aurora-admin`,
      }),
      storageEncrypted: true,
      deletionProtection: config.deletionProtection,
      backup: {
        retention: cdk.Duration.days(config.backupRetentionDays),
      },
      cloudwatchLogsExports: ['postgresql'],
      copyTagsToSnapshot: true,
      enableDataApi: true,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.securityGroup],
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    if (!this.cluster.secret) {
      throw new Error('Aurora cluster secret was not created');
    }

    this.adminSecret = this.cluster.secret;

    // Store cluster endpoint for cross-stack discovery
    const endpointParameter = new ssm.StringParameter(this, 'AuroraEndpointParameter', {
      parameterName: this.naming.ssmParameterName('aurora', 'endpoint'),
      stringValue: this.cluster.clusterEndpoint.hostname,
      description: 'Aurora PostgreSQL writer endpoint',
    });

    new cdk.CfnOutput(this, 'AuroraEndpoint', {
      value: this.cluster.clusterEndpoint.hostname,
      exportName: this.naming.exportName('aurora-endpoint'),
      description: 'Aurora cluster writer endpoint',
    });

    new cdk.CfnOutput(this, 'AuroraSecretArn', {
      value: this.adminSecret.secretArn,
      exportName: this.naming.exportName('aurora-secret-arn'),
      description: 'Master credentials secret ARN for Aurora cluster',
    });

    new cdk.CfnOutput(this, 'AuroraSecurityGroupId', {
      value: this.securityGroup.securityGroupId,
      exportName: this.naming.exportName('aurora-sg-id'),
      description: 'Aurora security group ID',
    });

    new cdk.CfnOutput(this, 'AuroraEndpointParameterPath', {
      value: endpointParameter.parameterName,
      exportName: this.naming.exportName('aurora-endpoint-ssm-path'),
      description: 'SSM parameter path containing Aurora endpoint',
    });
  }

  /**
   * Map manifest version string to CDK engine version helper
   */
  private resolveEngineVersion(engineVersion: string): rds.AuroraPostgresEngineVersion {
    const version = engineVersion.trim();

    switch (version) {
      case '16.4':
        return rds.AuroraPostgresEngineVersion.VER_16_4;
      case '16.6':
        return rds.AuroraPostgresEngineVersion.VER_16_6;
      default:
        return rds.AuroraPostgresEngineVersion.of(version, version.split('.')[0] ?? version);
    }
  }

  /**
   * Map retention days to Performance Insights retention enum
   */
  private resolvePerformanceInsightsRetention(
    retentionDays?: number,
  ): rds.PerformanceInsightRetention {
    const retentionMap: Record<number, rds.PerformanceInsightRetention> = {
      7: rds.PerformanceInsightRetention.DEFAULT,
      31: rds.PerformanceInsightRetention.MONTHS_1,
      62: rds.PerformanceInsightRetention.MONTHS_2,
      93: rds.PerformanceInsightRetention.MONTHS_3,
      124: rds.PerformanceInsightRetention.MONTHS_4,
      155: rds.PerformanceInsightRetention.MONTHS_5,
      186: rds.PerformanceInsightRetention.MONTHS_6,
      217: rds.PerformanceInsightRetention.MONTHS_7,
      248: rds.PerformanceInsightRetention.MONTHS_8,
      279: rds.PerformanceInsightRetention.MONTHS_9,
      310: rds.PerformanceInsightRetention.MONTHS_10,
      341: rds.PerformanceInsightRetention.MONTHS_11,
      372: rds.PerformanceInsightRetention.MONTHS_12,
      403: rds.PerformanceInsightRetention.MONTHS_13,
      434: rds.PerformanceInsightRetention.MONTHS_14,
      465: rds.PerformanceInsightRetention.MONTHS_15,
      496: rds.PerformanceInsightRetention.MONTHS_16,
      527: rds.PerformanceInsightRetention.MONTHS_17,
      558: rds.PerformanceInsightRetention.MONTHS_18,
      589: rds.PerformanceInsightRetention.MONTHS_19,
      620: rds.PerformanceInsightRetention.MONTHS_20,
      651: rds.PerformanceInsightRetention.MONTHS_21,
      682: rds.PerformanceInsightRetention.MONTHS_22,
      713: rds.PerformanceInsightRetention.MONTHS_23,
      731: rds.PerformanceInsightRetention.LONG_TERM,
    };

    return retentionMap[retentionDays ?? 7] ?? rds.PerformanceInsightRetention.DEFAULT;
  }
}
