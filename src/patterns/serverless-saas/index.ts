/**
 * Serverless SaaS Pattern
 *
 * Multi-brand SaaS on Lambda + API Gateway + DynamoDB with CloudFront edge.
 *
 * Architecture:
 * - Edge: CloudFront → S3 (webapp/marketing), CloudFront → API Gateway (APIs)
 * - Workload: Lambda, API Gateway, DynamoDB, EventBridge, ECR, S3, Secrets Manager
 *
 * Triggered by manifest sections: saasWorkload, saasEdge, infrastructure, domains
 */
export * from './stacks';
export { ServerlessSaasOrchestrator } from './orchestrator';
