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
 * - StaticWebAppStack: S3 bucket for static web app hosting
 */

export * from './vpc-stack';
export * from './ecs-cluster-stack';
export * from './ecs-fargate-service-stack';
export * from './static-webapp-stack';
export * from './saas-secrets-stack';
export * from './aurora-serverless-stack';
