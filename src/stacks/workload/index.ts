/**
 * Workload Stack Classes for CodeIQLabs projects
 *
 * This module provides reusable stack classes for workload infrastructure
 * that deploys to multi-environment accounts (nprd, prod, etc.).
 *
 * Architecture: Lambda + API Gateway + DynamoDB (serverless-first)
 *
 * Stacks in this module:
 * - EcrRepositoryStack: ECR repositories for Lambda container images
 * - SaasSecretsStack: Secrets Manager secrets for SaaS applications
 * - DynamoDBStack: DynamoDB tables for per-brand data storage
 * - LambdaFunctionStack: Lambda functions from ECR images with DynamoDB access
 * - ApiGatewayStack: HTTP API Gateway with routes to Lambda functions
 * - EventBridgeStack: EventBridge event bus with routing rules and DLQ
 */
export * from './ecr-repository-stack';
export * from './saas-secrets-stack';
export * from './dynamodb-stack';
export * from './lambda-function-stack';
export * from './api-gateway-stack';
export * from './eventbridge-stack';
