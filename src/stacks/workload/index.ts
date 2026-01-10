/**
 * Workload Stack Classes for CodeIQLabs projects
 *
 * This module provides reusable stack classes for workload infrastructure
 * that deploys to multi-environment accounts (nprd, prod, etc.).
 *
 * Stacks in this module:
 * - VpcStack: VPC with public/private/isolated subnets
 * - EcsClusterStack: ECS cluster with container insights
 * - EcsFargateServiceStack: Fargate service with ALB and SSM parameter
 * - EcrRepositoryStack: ECR repositories for container images
 * - SaasSecretsStack: Secrets Manager secrets for SaaS applications
 * - AuroraServerlessStack: Aurora Serverless v2 PostgreSQL database
 * - OriginHostedZoneStack: Route53 origin zones with Alias records to ALBs
 */
export * from './vpc-stack';
export * from './ecs-cluster-stack';
export * from './ecs-fargate-service-stack';
export * from './ecr-repository-stack';
export * from './saas-secrets-stack';
export * from './aurora-serverless-stack';
export * from './origin-hosted-zone-stack';
