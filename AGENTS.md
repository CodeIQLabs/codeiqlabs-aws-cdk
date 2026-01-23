---
trigger: always_on
---

## Purpose

CDK constructs and stacks library for CodeIQLabs AWS infrastructure. Provides:

- **Prebuilt Stacks** - Organizations, Identity Center, Domains, Workload infrastructure
- **L2/L3 Constructs** - Reusable constructs for ACM, CloudFront, Route53, S3, ECS, Aurora
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
│  │  ComponentOrchestrator - manifest-driven stack creation│  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Stacks Layer                         │  │
│  │  Organizations | Identity Center | Domains | Workload  │  │
│  │  Customization (VPC, ALB, CloudFront VPC Origins)     │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 Constructs Layer                       │  │
│  │  ACM | CloudFront | Route53 | S3 | ECS | Aurora       │  │
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

### Management Stacks (codeiqlabs-management-aws)

- `ManagementOrganizationsStack` - AWS Organizations, OUs, accounts
- `ManagementIdentityCenterStack` - Users, groups, permission sets, assignments

### Domain Stacks (codeiqlabs-customization-aws)

- `RootDomainStack` - Route53 hosted zones for root domains
- `AcmAndWafStack` - ACM certificates + WAF WebACLs (us-east-1)
- `CloudFrontVpcOriginStack` - CloudFront distributions with VPC origins
- `DnsRecordsStack` - A/AAAA records pointing to CloudFront
- `DomainDelegationStack` - NS records for subdomain delegation
- `StaticWebappStack` - S3 static hosting with CloudFront

### Customization Stacks (codeiqlabs-customization-aws)

- `GithubOidcStack` - GitHub Actions OIDC provider + IAM roles
- `InfraVpcStack` - VPC for CloudFront VPC origins
- `InfraAlbStack` - Internal ALB for VPC origin routing
- `VpcOriginStack` - CloudFront VPC origin configuration
- `SubdomainZoneStack` - Delegated subdomain hosted zones
- `OriginDomainStack` - Origin domain A records
- `AlbDnsRecordStack` - ALB DNS records in delegated zones
- `AlbHttpsListenerStack` - HTTPS listener with header-based routing
- `WorkloadParamsStack` - SSM parameters for cross-account sharing

### Workload Stacks (codeiqlabs-saas-aws)

- `EcsClusterStack` - ECS Fargate cluster
- `EcsFargateServiceStack` - ECS services with ALB integration
- `AuroraServerlessStack` - Aurora Serverless v2 PostgreSQL
- `EcrRepositoryStack` - ECR repositories for container images
- `SaasSecretsStack` - Secrets Manager for API keys, Stripe, etc.
- `VpcStack` - Workload VPC with public/private subnets
- `OriginHostedZoneStack` - Delegated subdomain zones in workload accounts

## Quick Start

### Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm run build

# Run tests
pnpm run test:all

# Lint and format
pnpm run lint
pnpm run format:check
```

### Publishing (Automated via CI)

The release workflow is automated via GitHub Actions using `changesets/action`:

1. **Create a changeset** describing your changes:

   ```bash
   pnpm changeset
   ```

2. **Commit and push** the changeset file along with your code changes

3. **CI opens a "Version Packages" PR** automatically when changesets are detected on `main`

4. **Merge the "Version Packages" PR** when ready to release - CI will:
   - Bump `package.json` version
   - Update `CHANGELOG.md`
   - Publish to GitHub Packages
   - Create a Git tag

> **⚠️ Important**: Do NOT run `pnpm changeset:version` locally or manually bump `package.json` -
> the CI pipeline handles versioning automatically.

### Local Development (File References)

When developing locally, use file references to ensure you're using the latest local code:

```json
{
  "dependencies": {
    "@codeiqlabs/aws-cdk": "file:../codeiqlabs-aws-cdk"
  }
}
```

After rebuilding aws-cdk, reinstall dependencies in consuming repos:

```bash
cd ../codeiqlabs-aws-cdk && pnpm run build
cd ../codeiqlabs-customization-aws && rm -rf node_modules pnpm-lock.yaml && pnpm install
```

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
- **VPC Origins require private subnets** - CloudFront VPC origins connect to internal ALBs
- **Cross-account DNS requires delegation** - NS records in parent zone must point to child zone
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

### Header-Based Routing

- **Why**: Single ALB serves multiple services (webapp, api) per brand
- **How**: CloudFront adds X-Forwarded-Service header, ALB routes based on it
- **Trade-off**: Header dependency, but enables multi-service routing on single ALB

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
- **Don't manually version packages** - Use changesets; CI handles versioning automatically
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

## Key Files

| File/Directory                                            | Purpose                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| `src/application/cdk-application.ts`                      | CDK app factory with manifest loading                           |
| `src/application/orchestration/component-orchestrator.ts` | Manifest-driven stack creation logic                            |
| `src/stacks/base-stack.ts`                                | Base class for all stacks (naming, tagging)                     |
| `src/stacks/organizations/`                               | AWS Organizations and account management stacks                 |
| `src/stacks/identity-center/`                             | Identity Center (SSO) stacks                                    |
| `src/stacks/domains/`                                     | Route53, ACM, CloudFront, DNS stacks                            |
| `src/stacks/customization/`                               | VPC, ALB, VPC Origins, GitHub OIDC stacks                       |
| `src/stacks/workload/`                                    | ECR, Secrets, DynamoDB, Lambda, API Gateway, EventBridge stacks |
| `src/constructs/`                                         | Reusable L2/L3 constructs                                       |
| `bin/app.ts`                                              | CDK entry point (calls createApp())                             |
| `package.json`                                            | Package metadata, exports, dependencies                         |

## Source of Truth

[codeiqlabs-docs](../codeiqlabs-docs/AGENTS.md)
