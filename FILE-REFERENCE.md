# CodeIQLabs AWS CDK - Complete File Reference

This document provides a comprehensive reference of every file in the `codeiqlabs-aws-cdk`
repository and its purpose.

## Repository Overview

**Package Name**: `@codeiqlabs/aws-cdk`  
**Version**: 1.3.0  
**Description**: CodeIQLabs AWS CDK wrapper utilities for Level 1 and Level 2 abstractions  
**Architecture**: Component-based orchestration system that automatically creates AWS resources
based on enabled components in manifest.yaml

---

## Root Directory Files

### Configuration Files

- **`package.json`** - NPM package configuration defining dependencies, scripts, and package
  metadata. Exports both ESM and CommonJS formats.

- **`tsconfig.json`** - TypeScript compiler configuration for the project.

- **`eslint.config.mjs`** - ESLint configuration for code linting and style enforcement.

- **`prettier.config.mjs`** - Prettier configuration for code formatting.

- **`lint-staged.config.mjs`** - Configuration for lint-staged to run linters on git staged files.

### Documentation Files

- **`README.md`** - Main package documentation with architecture overview and usage examples.

- **`CHANGELOG.md`** - Version history and release notes tracking all changes to the package.

- **`CONTRIBUTING.md`** - Guidelines for contributing to the project.

- **`LICENSE`** - MIT license file for the package.

### Supporting Assets

- **`FILE-REFERENCE.md`** - This file. Repository-wide file inventory with descriptions.
- **`samples/`** - Sample manifest files referenced in the README for common stack deployments.
- **`tests/`** - ESM and CommonJS smoke tests (`npm run test:all`) that expect the library to be
  built into `dist/`.

---

## `/src` - Source Code Directory

**Total TypeScript Files: 47**

### Complete File List

#### Application Layer (12 files)

1. `src/application/cdk-application.ts`
2. `src/application/config/app-config.ts`
3. `src/application/config/factory-options.ts`
4. `src/application/config/index.ts`
5. `src/application/factories/app-factory.ts`
6. `src/application/factories/factory-utils.ts`
7. `src/application/factories/index.ts`
8. `src/application/index.ts`
9. `src/application/orchestration/base-orchestrator.ts`
10. `src/application/orchestration/component-orchestrator.ts`
11. `src/application/orchestration/index.ts`
12. `src/application/types.ts`

#### Constructs Layer (22 files)

13. `src/constructs/acm/constructs.ts`
14. `src/constructs/acm/index.ts`
15. `src/constructs/acm/types.ts`
16. `src/constructs/cloudfront/constructs.ts`
17. `src/constructs/cloudfront/index.ts`
18. `src/constructs/cloudfront/types.ts`
19. `src/constructs/deployment-permissions/index.ts`
20. `src/constructs/deployment-permissions/types.ts`
21. `src/constructs/identity-center/constructs.ts`
22. `src/constructs/identity-center/index.ts`
23. `src/constructs/identity-center/types.ts`
24. `src/constructs/index.ts`
25. `src/constructs/organizations/constructs.ts`
26. `src/constructs/organizations/index.ts`
27. `src/constructs/organizations/types.ts`
28. `src/constructs/route53/constructs.ts`
29. `src/constructs/route53/index.ts`
30. `src/constructs/route53/types.ts`
31. `src/constructs/s3/constructs.ts`
32. `src/constructs/s3/index.ts`
33. `src/constructs/s3/types.ts`
34. `src/constructs/types.ts`

#### Core Layer (2 files)

35. `src/core/constructs/named-construct.ts`
36. `src/core/constructs/tagged-construct.ts`

#### Stacks Layer - Component-Based Organization (10 files)

37. `src/stacks/base/base-stack.ts`
38. `src/stacks/base/index.ts`
39. `src/stacks/domains/domain-delegation-stack.ts`
40. `src/stacks/domains/index.ts`
41. `src/stacks/identity-center/identity-center-stack.ts`
42. `src/stacks/identity-center/index.ts`
43. `src/stacks/index.ts`
44. `src/stacks/organizations/index.ts`
45. `src/stacks/organizations/organizations-stack.ts`
46. `src/stacks/types.ts`

#### Root (1 file)

47. `src/index.ts`

---

### `/src/index.ts`

Main package entry point that exports all public APIs including:

- Application factory (`createApp`)
- Stack classes (base, component-based stacks)
- Constructs (organizations, identity center, static hosting, etc.)
- Types and interfaces

---

## `/src/application` - Application Layer

The application layer handles CDK application creation, configuration, and orchestration.

### Core Application Files

#### `/src/application/cdk-application.ts`

**Purpose**: Core `CdkApplication` class that manages the CDK application lifecycle.

**Key Responsibilities**:

- Creates and initializes CDK App instances
- Loads and validates manifest configuration
- Delegates to ComponentOrchestrator for stack creation
- Provides `create()` static factory method

**Key Methods**:

- `create()` - Static factory method to create configured application
- `initializeManifest()` - Loads manifest from file and validates it

#### `/src/application/types.ts`

**Purpose**: TypeScript type definitions for the application layer.

**Key Types**:

- `CdkApplicationOptions` - Options for creating CDK applications
- `ApplicationInitResult` - Result of application initialization
- `StageCreationOptions` - Options for creating CDK stages

#### `/src/application/index.ts`

**Purpose**: Barrel export file for the application module.

**Exports**:

- `CdkApplication` class
- `createApp` factory function
- Application types and interfaces

---

### `/src/application/config` - Configuration Management

#### `/src/application/config/app-config.ts`

**Purpose**: Application configuration creation and validation.

**Key Functions**:

- `createAppConfig()` - Creates validated application configuration
- `validateFactoryOptions()` - Validates factory options before app creation

**Key Types**:

- `AppConfig` - Internal application configuration interface

#### `/src/application/config/factory-options.ts`

**Purpose**: Type definitions for factory options.

**Key Types**:

- `FactoryOptions` - Options passed to application factory functions

#### `/src/application/config/index.ts`

**Purpose**: Barrel export for configuration module.

---

### `/src/application/factories` - Application Factory Functions

#### `/src/application/factories/app-factory.ts`

**Purpose**: Factory function for creating CDK applications.

**Key Functions**:

- `createApp()` - Unified factory function that creates a CDK application with component-based
  orchestration

#### `/src/application/factories/factory-utils.ts`

**Purpose**: Utility functions for application factories.

**Key Functions**:

- `createConfiguredApplication()` - Creates and configures a CdkApplication instance
- Helper functions for application setup

#### `/src/application/factories/index.ts`

**Purpose**: Barrel export for factory functions.

---

### `/src/application/orchestration` - Stack Orchestration

#### `/src/application/orchestration/base-orchestrator.ts`

**Purpose**: Base orchestrator class with common orchestration logic.

**Key Responsibilities**:

- Provides base functionality for all orchestrators
- Common validation and utility methods

#### `/src/application/orchestration/component-orchestrator.ts`

**Purpose**: Component-based orchestrator that creates stacks based on enabled components.

**Key Responsibilities**:

- Detects enabled components in manifest (organization, identityCenter, domains)
- Creates appropriate stacks for each enabled component
- Handles cross-account dependencies and stack ordering
- For domains component, creates two stages: DomainFoundationStage (RootDomain, AcmAndWaf in
  us-east-1, optional DomainDelegation) and DomainWireupStage (CloudFrontDistribution in us-east-1,
  DnsRecords)

**Key Methods**:

- `orchestrate()` - Main orchestration method that creates all necessary stacks
- Component detection methods for each component type

**Domain Stack Creation**:

When `config.domains.enabled` is true, creates the following stacks in order:

1. **RootDomainStack** - Creates Route53 hosted zones for registered domains
2. **AcmAndWafStack** - Issues us-east-1 ACM certificates and WAF Web ACLs for CloudFront
3. **CloudFrontDistributionStack** - Creates CloudFront distributions (us-east-1) using exported
   certificates
4. **DnsRecordsStack** - Creates ALIAS records pointing to CloudFront distributions
5. **DomainDelegationStack** - Creates NS delegation records (only if delegations are configured)

#### `/src/application/orchestration/index.ts`

**Purpose**: Barrel export for orchestration module.

---

## `/src/stacks` - Stack Implementations

Pre-built, reusable stack implementations for common infrastructure patterns.

### `/src/stacks/types.ts`

**Purpose**: Common type definitions for all stacks.

### `/src/stacks/index.ts`

**Purpose**: Barrel export for all stack modules.

---

### `/src/stacks/base` - Base Stack Classes

#### `/src/stacks/base/base-stack.ts`

**Purpose**: Unified base class for all AWS CDK stacks.

**Key Features**:

- Automatic resource naming with environment-based conventions
- Automatic tagging with standard tags
- Support for both single-account and multi-environment deployments
- Environment validation with clear error messages
- Consistent initialization across all stacks

**Key Class**: `BaseStack`

**Key Types**:

- `BaseStackConfig` - Configuration for any stack (environment-based, not account-type-based)
- `BaseStackProps` - Props for BaseStack

#### `/src/stacks/base/index.ts`

**Purpose**: Barrel export for base stack classes.

---

### `/src/stacks/organizations` - AWS Organizations Component

Stacks for AWS Organizations infrastructure.

#### `/src/stacks/organizations/organizations-stack.ts`

**Purpose**: Stack for creating and managing AWS Organizations structure.

**Key Features**:

- Creates organizational units (OUs)
- Creates and manages AWS accounts
- Configures organization policies

**Key Class**: `ManagementOrganizationsStack`

#### `/src/stacks/organizations/index.ts`

**Purpose**: Barrel export for Organizations stacks.

---

### `/src/stacks/identity-center` - AWS Identity Center Component

Stacks for AWS IAM Identity Center (SSO) infrastructure.

#### `/src/stacks/identity-center/identity-center-stack.ts`

**Purpose**: Stack for AWS IAM Identity Center (SSO) configuration.

**Key Features**:

- Creates Identity Center users and groups
- Configures permission sets
- Manages account assignments

**Key Class**: `ManagementIdentityCenterStack`

#### `/src/stacks/identity-center/index.ts`

**Purpose**: Barrel export for Identity Center stacks.

---

### `/src/stacks/domains` - Domain Management Component

Stacks for centralized multi-account domain management, including Route53 hosted zones, CloudFront
distributions, and DNS records.

#### `/src/stacks/domains/root-domain-stack.ts`

**Purpose**: Stack for managing Route53 hosted zones for all registered domains in the management
account.

**Key Features**:

- Creates or imports Route53 hosted zones for each registered domain
- Exports hosted zone IDs for use by CloudFront and DNS stacks
- Exports name servers for domain registrar configuration
- Consistent naming and tagging for all domain resources

**Key Class**: `RootDomainStack`

**Key Exports**:

- `{DomainName}HostedZoneId` - Hosted zone ID for cross-stack references
- `{DomainName}NameServers` - Name servers for domain registrar
- `{DomainName}ZoneName` - Zone name for reference

**Deployment Frequency**: Rare (only when adding new domains)

#### `/src/stacks/domains/acm-waf-stack.ts`

**Purpose**: Stage 1 stack for us-east-1 ACM certificates and WAF Web ACLs used by CloudFront.

**Key Features**:

- Validates deployment in us-east-1 (CloudFront certificate requirement)
- Imports hosted zones from RootDomainStack
- Issues combined apex + wildcard certificate per registered domain (one cert covers both)
- Exports certificate ARNs for CloudFront distributions
- Creates environment-wide WAF Web ACLs (prod open, nprd IP-allowlist)

**Key Class**: `AcmAndWafStack`

**Key Exports**:

- `{DomainName}WildcardCertificateArn` / `{DomainName}ApexCertificateArn` - Combined ACM certificate
  ARN for apex + wildcard
- `ProdWebAclArn`, `NprdWebAclArn` - WAF Web ACL ARNs for CloudFront

**Deployment Frequency**: Infrequent (when adding domains or adjusting WAF/certs)

#### `/src/stacks/domains/cloudfront-distribution-stack.ts`

**Purpose**: Stage 2 stack for CloudFront distributions per registered domain using exported
certificates.

**Key Features**:

- Creates one CloudFront distribution per brand and groups subdomains as alternate domain names
- Imports combined certificate ARN from `AcmAndWafStack`
- Uses a placeholder HTTP origin until workload ALBs are deployed
- Exports distribution domains/IDs for DNS wiring
- TLS best practices (TLS 1.2 2021, HTTP/2+3, IPv6)

**Key Class**: `CloudFrontDistributionStack`

**Key Exports**:

- `{DomainName}DistributionDomain` - CloudFront distribution domain name
- `{DomainName}DistributionId` - CloudFront distribution ID
- `{SubdomainName}DistributionDomain` - Subdomain export to support DNS records

**Deployment Frequency**: Infrequent (when adding domains or changing CloudFront config)

#### `/src/stacks/domains/dns-records-stack.ts`

**Purpose**: Stack for creating DNS records (ALIAS records) in Route53 that point to CloudFront
distributions or ALBs.

**Key Features**:

- Creates ALIAS records for CloudFront distributions
- Creates ALIAS/CNAME records for cross-account ALBs
- Supports apex domain records
- Imports targets from CloudFront and ALB stacks
- Consistent naming and tagging

**Key Class**: `DnsRecordsStack`

**Key Exports**:

- `{SubdomainName}RecordCreated` - Confirmation of DNS record creation
- `{SubdomainName}DnsRecord` - DNS record information

**Dependencies**:

- RootDomainStack (for hosted zones)
- CloudFrontDistributionStack (for CloudFront distribution domains)
- Workload ALB stacks (for ALB DNS names)

**Deployment Frequency**: Frequent (whenever CloudFront or ALB endpoints change)

#### `/src/stacks/domains/domain-delegation-stack.ts`

**Purpose**: Stack for delegating Route53 subdomains to other accounts via NS records.

**Key Features**:

- Creates NS records in parent hosted zone
- Delegates DNS management to target accounts
- Manages cross-account DNS permissions
- Custom resource for querying workload account hosted zones

**Key Class**: `DomainDelegationStack`

**Deployment Frequency**: Infrequent (when adding new delegations)

#### `/src/stacks/domains/index.ts`

**Purpose**: Barrel export for domain management stacks.

---

## `/src/constructs` - Reusable CDK Constructs

Standardized L2/L3 constructs for common AWS resources.

### `/src/constructs/types.ts`

**Purpose**: Common type definitions for all constructs.

### `/src/constructs/index.ts`

**Purpose**: Barrel export for all construct modules.

---

### `/src/constructs/organizations` - AWS Organizations Constructs

#### `/src/constructs/organizations/constructs.ts`

**Purpose**: CDK constructs for AWS Organizations resources.

**Key Constructs**:

- `OrganizationConstruct` - Creates and manages AWS Organizations
- `OrganizationalUnitConstruct` - Creates OUs
- `AccountConstruct` - Creates AWS accounts

#### `/src/constructs/organizations/types.ts`

**Purpose**: Type definitions for Organizations constructs.

#### `/src/constructs/organizations/index.ts`

**Purpose**: Barrel export for Organizations constructs.

---

### `/src/constructs/identity-center` - IAM Identity Center Constructs

#### `/src/constructs/identity-center/constructs.ts`

**Purpose**: CDK constructs for IAM Identity Center (SSO).

**Key Constructs**:

- `IdentityCenterConstruct` - Main construct for Identity Center setup
- User and group management constructs
- Permission set constructs

#### `/src/constructs/identity-center/types.ts`

**Purpose**: Type definitions for Identity Center constructs.

#### `/src/constructs/identity-center/index.ts`

**Purpose**: Barrel export for Identity Center constructs.

---

### `/src/constructs/route53` - Route53 DNS Constructs

#### `/src/constructs/route53/constructs.ts`

**Purpose**: CDK constructs for Route53 DNS resources.

**Key Constructs**:

- Hosted zone creation and management
- DNS record management
- Cross-account delegation

#### `/src/constructs/route53/types.ts`

**Purpose**: Type definitions for Route53 constructs.

#### `/src/constructs/route53/index.ts`

**Purpose**: Barrel export for Route53 constructs.

---

### `/src/constructs/acm` - AWS Certificate Manager Constructs

#### `/src/constructs/acm/constructs.ts`

**Purpose**: CDK constructs for ACM SSL/TLS certificates.

**Key Constructs**:

- Certificate provisioning
- DNS validation
- Certificate management

#### `/src/constructs/acm/types.ts`

**Purpose**: Type definitions for ACM constructs.

#### `/src/constructs/acm/index.ts`

**Purpose**: Barrel export for ACM constructs.

---

### `/src/constructs/s3` - S3 Bucket Constructs

#### `/src/constructs/s3/constructs.ts`

**Purpose**: CDK constructs for S3 buckets.

**Key Constructs**:

- Static website hosting buckets
- Bucket policies and permissions
- Lifecycle policies

#### `/src/constructs/s3/types.ts`

**Purpose**: Type definitions for S3 constructs.

#### `/src/constructs/s3/index.ts`

**Purpose**: Barrel export for S3 constructs.

---

### `/src/constructs/cloudfront` - CloudFront Distribution Constructs

#### `/src/constructs/cloudfront/constructs.ts`

**Purpose**: CDK constructs for CloudFront distributions.

**Key Constructs**:

- Distribution creation and configuration
- Origin configuration (S3, custom)
- Cache behaviors and policies
- Security headers and WAF integration

#### `/src/constructs/cloudfront/types.ts`

**Purpose**: Type definitions for CloudFront constructs.

#### `/src/constructs/cloudfront/index.ts`

**Purpose**: Barrel export for CloudFront constructs.

---

### `/src/constructs/deployment-permissions` - Deployment Permission Constructs

#### `/src/constructs/deployment-permissions/index.ts`

**Purpose**: Constructs for managing cross-account deployment permissions.

**Key Features**:

- IAM roles for cross-account deployments
- Trust relationships
- Permission boundaries

#### `/src/constructs/deployment-permissions/types.ts`

**Purpose**: Type definitions for deployment permission constructs.

---

## `/src/core` - Core Utilities

### `/src/core/constructs/named-construct.ts`

**Purpose**: Base construct class that provides automatic naming conventions.

**Key Features**:

- Consistent resource naming across all constructs
- Environment-aware naming
- Prefix and suffix support

### `/src/core/constructs/tagged-construct.ts`

**Purpose**: Base construct class that provides automatic tagging.

**Key Features**:

- Automatic application of standard tags
- Custom tag support
- Tag inheritance

---

## `/tests` - Test Files

### `/tests/esm-import-test.mjs`

**Purpose**: Test to verify ESM module imports work correctly.

### `/tests/load-config.test.cjs`

**Purpose**: Test to verify CommonJS module loading and configuration.

---

## `/dist` - Build Output (Generated)

Generated by `npm run build` (not committed to the repository by default). Contains compiled
JavaScript, TypeScript declarations, and source maps:

- **`index.js`** - ESM bundle
- **`index.cjs`** - CommonJS bundle
- **`index.d.ts`** - TypeScript declarations for ESM
- **`index.d.cts`** - TypeScript declarations for CommonJS
- **`*.map`** - Source maps for debugging

---

## Architecture Summary

The repository follows a layered architecture:

1. **Application Layer** (`/src/application`) - Handles app creation, configuration, and
   orchestration
2. **Orchestration Layer** (`/src/application/orchestration`) - Component-based stack creation logic
3. **Stack Layer** (`/src/stacks`) - Pre-built stack implementations with unified BaseStack
4. **Construct Layer** (`/src/constructs`) - Reusable L2/L3 CDK constructs
5. **Core Layer** (`/src/core`) - Base classes and utilities

The system uses a **component-based approach** where the ComponentOrchestrator detects enabled
components in the manifest and creates the appropriate stacks automatically, eliminating the need
for manifestType-based routing.

### Key Architectural Features

**Unified Base Stack**: The repository uses a single `BaseStack` class for all deployment patterns
(single-account and multi-environment). Naming is environment-based, not account-type-based.

**Component Detection**: Component detection is performed directly in the ComponentOrchestrator by
checking `config.organization?.enabled`, `config.identityCenter?.enabled`, etc.
