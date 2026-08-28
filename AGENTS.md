---
inclusion: always
---

## Purpose

CDK constructs and stacks library for CodeIQLabs AWS infrastructure. Provides:

- **Prebuilt Stacks** - Organizations, Identity Center, Domains, Workload infrastructure
- **L2/L3 Constructs** - Reusable constructs for ACM, CloudFront, Route53, S3, Lambda, DynamoDB
- **ComponentOrchestrator** - Manifest-driven stack creation based on enabled components
- **BaseStack** - Unified base with consistent naming, tagging, and environment validation
- **Multi-Account Support** - Cross-account DNS delegation, VPC origins, workload parameters

## Current State

Active and stable. Published to GitHub Packages. Used by all CodeIQLabs infrastructure repos.

**Package**: `@codeiqlabs/aws-cdk`  
**Version**: ![GitHub package.json version](https://img.shields.io/github/package-json/v/CodeIQLabs/codeiqlabs-aws-cdk?label=version)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    @codeiqlabs/aws-cdk                       │
│                    (CDK Constructs Layer)                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  Application Layer                     │  │
│  │  CdkApplication, createApp() factory                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │               Orchestration Layer                      │  │
│  │  ComponentOrchestrator - thin dispatcher               │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  Patterns Layer                        │  │
│  │  ServerlessSaasOrchestrator + pattern-specific stacks  │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Shared Stacks Layer                       │  │
│  │  Organizations | Identity Center | GitHub OIDC         │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 Constructs Layer                       │  │
│  │  ACM | CloudFront | Route53 | S3 | Lambda | DynamoDB  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ (depends on)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  @codeiqlabs/aws-utils                       │
│  Naming | Tagging | Schemas | Validation | Helpers          │
└─────────────────────────────────────────────────────────────┘
```

## Stack Categories

### Shared Stacks (src/stacks/)

- `ManagementOrganizationsStack` - AWS Organizations, OUs, accounts
- `ManagementIdentityCenterStack` - Users, groups, permission sets, assignments
- `GithubOidcStack` - GitHub Actions OIDC provider + IAM roles

### Serverless SaaS Pattern (src/patterns/serverless-saas/)

**Edge Stacks** (stacks/edge/):

- `RootDomainStack` - Route53 hosted zones for root domains
- `AcmAndWafStack` - ACM certificates + WAF WebACLs (us-east-1)
- `CloudFrontVpcOriginStack` - CloudFront distributions with VPC origins
- `DnsRecordsStack` - A/AAAA records pointing to CloudFront
- `StaticWebAppStack` - S3 static hosting with CloudFront
- `SubdomainZoneStack` - Delegated subdomain hosted zones
- `ApiGatewayDomainStack` - ACM certificates + API Gateway custom domains
- `WorkloadParamsStack` - SSM parameters for cross-account sharing

**Workload Stacks** (stacks/workload/):

- `DynamoDBStack` - Per-brand DynamoDB tables (single-table design)
- `LambdaFunctionStack` - API Lambda functions from ECR images
- `ApiGatewayStack` - HTTP API Gateway with per-brand routing
- `EventBridgeStack` - Event bus for async processing
- `EventHandlerLambdaStack` - Event handler Lambdas (auto-matcher)
- `ScheduledJobLambdaStack` - Background job Lambdas with scheduled rules
- `EcrRepositoryStack` - ECR repositories for container images
- `SaasSecretsStack` - Secrets Manager for API keys, Stripe, etc.
- `ProductSeedStack` - Seeds product entities into DynamoDB
- `TrialExpiryStack` - Daily trial expiry checker (ECR-based DockerImageFunction)

## Quick Start

```bash
pnpm install && pnpm run build
```

Depends on `aws-utils` (rebuild it first). Full build/test/troubleshooting workflow:
[`codeiqlabs-docs/runbooks/build-cdk-libraries.md`](../codeiqlabs-docs/runbooks/build-cdk-libraries.md).

## Dependencies

**Peer Dependencies**:

- `aws-cdk-lib` ^2.213.0
- `constructs` ^10.0.0

**Core Dependencies**:

- `@codeiqlabs/aws-utils` ^1.10.0 - Naming, tagging, schemas, validation

## Gotchas

- **Always rebuild aws-utils first** - This package depends on aws-utils; rebuild it before
  rebuilding aws-cdk
- **Use file references for local dev** - Don't rely on published versions during development
- **CloudFront requires us-east-1** - ACM certificates and WAF WebACLs must be in us-east-1
- **Cross-account DNS requires delegation** - NS records in parent zone must point to child zone
- **Serverless workload architecture** - Workload stacks use Lambda + API Gateway, not ECS/ALB
- **BaseStack provides naming** - All stacks extend BaseStack for consistent resource naming
- **Presence implies enabled** - No `enabled: true` flags in schemas; if a section exists, it's
  deployed
- **environments is required** - Use `environments.mgmt` for single-account repos

## Architecture Decisions

### Component-Based Orchestration

- **Why**: Different repos need different subsets of stacks
- **How**: ComponentOrchestrator reads manifest and creates only enabled stacks
- **Trade-off**: More complex orchestration, but flexible deployment

### BaseStack Pattern

- **Why**: Consistent naming and tagging across all stacks
- **How**: All stacks extend BaseStack which provides ResourceNaming instance
- **Trade-off**: Inheritance hierarchy, but guaranteed consistency

### API Gateway Per-Brand Routing

- **Why**: Single API Gateway serves multiple brand APIs
- **How**: Routes pattern `/{brand}/{proxy+}` maps to brand-specific Lambda functions
- **Trade-off**: Route-based routing, but enables multi-brand API on single gateway

### Patterns Layer

- **Why**: Isolate pattern-specific stacks so future patterns (e.g., ECS workload) can be added
  without cross-pattern breakage
- **How**: `src/patterns/serverless-saas/` contains its own orchestrator and stacks;
  ComponentOrchestrator detects the pattern and delegates
- **Trade-off**: Additional directory nesting, but clear separation between shared and
  pattern-specific infrastructure

## Anti-Patterns

- **Don't hardcode account IDs or regions** - Use manifest.yaml and environment configuration
- **Don't hardcode brand/company names** - Use `this.naming.ssmParameterName()` or
  `stackConfig.company` instead of hardcoding `/codeiqlabs/...` or `codeiqlabs.com`
- **Don't hardcode domain names in filters** - Use manifest flags (e.g., check distribution types)
  instead of `domain !== 'codeiqlabs.com'`
- **Don't create circular stack dependencies** - Use SSM parameters or direct references
- **Don't bypass BaseStack** - All stacks must extend BaseStack for consistent naming/tagging
- **Don't use `enabled: true` flags** - Presence in manifest implies enabled
  (convention-over-configuration)
- **Don't skip rebuilding aws-utils** - Always rebuild aws-utils before aws-cdk
- **Don't use published versions in local dev** - Use `file:../` references for local development
- **Don't create stacks in wrong accounts** - Management stacks → mgmt, Workload stacks → nprd/prod
- **Don't mix CloudFront and non-CloudFront certs** - CloudFront certs must be in us-east-1

## Reusable by Design

This library must be **brand-agnostic** and **company-agnostic**. All organization-specific values
must come from manifest files, not hardcoded in the library.

### SSM Parameter Paths

**Wrong** (hardcoded company name):

```typescript
const ssmPrefix = `/codeiqlabs/saas/${environment}`;
new ssm.StringParameter(this, 'Param', {
  parameterName: `${ssmPrefix}/alb/arn`,
});
```

**Right** (use naming utility):

```typescript
new ssm.StringParameter(this, 'Param', {
  parameterName: this.naming.ssmParameterName('alb', 'arn'),
});
```

For org-level parameters (not project-scoped):

```typescript
const company = this.getStackConfig().company.toLowerCase();
new ssm.StringParameter(this, 'Param', {
  parameterName: `/${company}/org/account-id`,
});
```

### Domain Filtering

**Wrong** (hardcoded domain name):

```typescript
const brandDomains = saasEdge.filter((edge) => edge.domain !== 'codeiqlabs.com');
```

**Right** (use manifest-driven logic):

```typescript
// Filter based on distribution types - marketing-only domains don't need subdomain delegation
const brandDomains = saasEdge.filter((edge) => {
  const distributions = edge.distributions;
  return distributions.some((d) => d.type === 'webapp' || d.type === 'api');
});
```

### Origin Domains

**Wrong** (hardcoded domain):

```typescript
this.originDomain = `origin-${props.environment}.codeiqlabs.com`;
```

**Right** (use props):

```typescript
this.originDomain = `origin-${props.environment}.${props.hostedZoneName}`;
```

### What's Acceptable

- **Import statements**: `import { ... } from '@codeiqlabs/aws-utils'` - Package names are fine
- **JSDoc examples**: Using brand names in documentation examples is acceptable
- **Comments**: Explaining architecture with example domains is fine

## Steering Files Guide

| Working on...       | Apply guidance from...         |
| ------------------- | ------------------------------ |
| `src/constructs/**` | `docs/steering/constructs.md` |
| `src/stacks/**`     | `docs/steering/stacks.md`     |
| `src/patterns/**`   | `docs/steering/patterns.md`   |
| Build/publish tasks | `docs/steering/build.md`      |

## Key Files

| File/Directory                                            | Purpose                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| `src/application/cdk-application.ts`                      | CDK app factory with manifest loading                       |
| `src/application/orchestration/component-orchestrator.ts` | Thin dispatcher - delegates to pattern orchestrators        |
| `src/patterns/serverless-saas/orchestrator.ts`            | Serverless SaaS pattern orchestration logic                 |
| `src/patterns/serverless-saas/stacks/edge/`               | Edge stacks: CloudFront, Route53, ACM, WAF, S3              |
| `src/patterns/serverless-saas/stacks/workload/`           | Workload stacks: Lambda, DynamoDB, API GW, EventBridge, ECR |
| `src/stacks/base/base-stack.ts`                           | Base class for all stacks (naming, tagging)                 |
| `src/stacks/organizations/`                               | AWS Organizations and account management stacks             |
| `src/stacks/identity-center/`                             | Identity Center (SSO) stacks                                |
| `src/stacks/customization/`                               | GitHub OIDC stacks                                          |
| `src/constructs/`                                         | Reusable L2/L3 constructs                                   |
| `package.json`                                            | Package metadata, exports, dependencies                     |

## Source of Truth

[codeiqlabs-docs](../codeiqlabs-docs/AGENTS.md)
