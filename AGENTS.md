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

### Separate ACM/WAF Stack

- **Why**: CloudFront requires certificates in us-east-1
- **How**: AcmAndWafStack deploys to us-east-1, other stacks deploy to target region
- **Trade-off**: Cross-region dependencies, but required by AWS

### VPC Origins for Private ALBs

- **Why**: Keep ALBs internal while exposing via CloudFront
- **How**: CloudFront VPC origins connect to internal ALBs via private subnets
- **Trade-off**: More complex networking, but better security

### Header-Based Routing

- **Why**: Single ALB serves multiple services (webapp, api) per brand
- **How**: CloudFront adds X-Forwarded-Service header, ALB routes based on it
- **Trade-off**: Header dependenc
