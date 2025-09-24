# CodeIQLabs CDK Architecture

This document describes the complete architecture of the `@codeiqlabs/aws-cdk` package, showing how
manifest-driven infrastructure deployment works across both management and workload patterns.

## Architecture Overview

The CodeIQLabs CDK follows a 5-layer architecture that automatically detects the infrastructure
pattern from your `manifest.yaml` file and creates the appropriate AWS resources with built-in
naming, tagging, and best practices.

```mermaid
graph TD
    A[<b>manifest.yaml</b>] --> B[<b>createAutoApp</b><br/>application/factories/app-factory.ts]

    B --> C[<b>CdkApplication.create</b><br/>application/cdk-application.ts]
    C --> D[<b>initializeApp</b><br/>aws-utils package]
    D --> E[<b>Manifest Loading & Validation</b>]
    E --> F{<b>manifestType Detection</b>}

    F -->|type: management| G[<b>Management Flow</b>]
    F -->|type: workload| H[<b>Workload Flow</b>]

    G --> I[<b>ManagementOrchestrator</b><br/>application/orchestration/management-orchestrator.ts]
    I --> J{<b>detectManagementComponents</b><br/>detection/management-detector.ts}
    I --> K[<b>ManagementStageRegistry</b><br/>application/registry/management-stage-registry.ts]

    J --> J1[<b>Check config.organizations</b><br/>organizations.enabled === true]
    J --> J2[<b>Check config.identityCenter</b><br/>identityCenter.enabled === true]
    J --> J3[<b>Check config.domainAuthority</b><br/>domainAuthority.enabled === true]

    K --> L[<b>OrganizationsStage</b><br/>stages/management/organizations-stage.ts]
    K --> M[<b>IdentityCenterStage</b><br/>stages/management/identity-center-stage.ts]
    K --> N[<b>DomainAuthorityStage</b><br/>stages/management/domain-authority-stage.ts]

    J1 -.-> L
    J2 -.-> M
    J3 -.-> N

    L --> L1[<b>ManagementOrganizationsStack</b><br/>stacks/management/organizations-stack.ts]
    M --> M1[<b>ManagementIdentityCenterStack</b><br/>stacks/management/identity-center-stack.ts]
    N --> N1[<b>DomainDelegationStack</b><br/>stacks/management/domain-delegation-stack.ts]

    L1 --> L2[<b>OrganizationConstruct</b><br/>constructs/organizations/constructs.ts]
    M1 --> M2[<b>IdentityCenterConstruct</b><br/>constructs/identity-center/constructs.ts]
    N1 --> N2[<b>Route53 & Lambda</b><br/>stacks/management/domain-delegation-stack.ts]

    H --> O[<b>WorkloadOrchestrator</b><br/>application/orchestration/workload-orchestrator.ts]
    O --> P{<b>detectWorkloadPattern</b><br/>detection/workload-detector.ts}
    O --> Q[<b>WorkloadStageRegistry</b><br/>application/registry/workload-stage-registry.ts]

    P --> P1[<b>Check config.staticHosting</b><br/>staticHosting.enabled === true]
    P --> P2[<b>Check environments</b><br/>environments env.domain exists]
    P --> P3[<b>Default fallback</b><br/>Always returns static-hosting]

    Q --> R[<b>StaticHostingStage</b><br/>stages/workload/static-hosting-stage.ts]
    P1 -.-> R
    P2 -.-> R
    P3 -.-> R

    R --> S[<b>createWorkloadStage</b><br/>for each envName in environments]
    S --> T[<b>StaticHostingDomainStack</b><br/>stacks/workload/static-hosting-domain-stack.ts]
    S --> U[<b>StaticHostingFrontendStack</b><br/>stacks/workload/static-hosting-frontend-stack.ts]

    T --> T1[<b>Route53 Constructs</b><br/>constructs/route53/constructs.ts]
    T --> T2[<b>ACM Constructs</b><br/>constructs/acm/constructs.ts]

    U --> U1[<b>S3 Constructs</b><br/>constructs/s3/constructs.ts]
    U --> U2[<b>CloudFront Constructs</b><br/>constructs/cloudfront/constructs.ts]

%% Cross-account delegation
    N1 -.-> T1
    N2 -.-> T1

%% Styles - lighter fills, darker text
    classDef manifest fill:#f9fdff,stroke:#01579b,stroke-width:2px,color:#111
    classDef factory fill:#fffaf2,stroke:#e65100,stroke-width:2px,color:#111
    classDef orchestration fill:#faf5fc,stroke:#4a148c,stroke-width:2px,color:#111
    classDef registry fill:#f6fff6,stroke:#2e7d32,stroke-width:2px,color:#111
    classDef detection fill:#faf5fc,stroke:#4a148c,stroke-width:2px,color:#111
    classDef mgmt fill:#f6fff6,stroke:#1b5e20,stroke-width:2px,color:#111
    classDef workload fill:#f9fbff,stroke:#0d47a1,stroke-width:2px,color:#111
    classDef stacks fill:#fff9fb,stroke:#880e4f,stroke-width:2px,color:#111
    classDef constructs fill:#ffffff,stroke:#666666,stroke-width:2px,color:#111
    classDef logic fill:#fffef7,stroke:#f57f17,stroke-width:1px,stroke-dasharray: 5 5,color:#111

    class A manifest
    class B factory
    class C,D,E factory
    class I,O orchestration
    class K,Q registry
    class F,J,P detection
    class G,L,M,N,L1,M1,N1 mgmt
    class H,R,S,T,U workload
    class L2,M2,N2,T1,T2,U1,U2 constructs
    class J1,J2,J3,P1,P2,P3 logic


```

## Core Concepts

### 1. Manifest-Driven Infrastructure

Everything starts with a `manifest.yaml` file that describes your infrastructure requirements:

```yaml
# Management Account Example
type: "management"
project: "CodeIQLabs"
company: "CodeIQLabs"

# Workload Account Example
type: "workload"
project: "MyProject"
company: "MyCompany"
environments:
  nprd:
    accountId: "123456789012"
    config:
      domain:
        name: "staging.example.com"
```

### 2. Auto-Detection

The system automatically detects what type of infrastructure to create based on the manifest
content:

- **Management Type**: Creates organizational infrastructure
- **Workload Type**: Creates application hosting infrastructure

### 3. Two Core Patterns

#### Management Pattern

Creates foundational organizational infrastructure:

- **AWS Organizations** with OUs and member accounts
- **Identity Center SSO** with permission sets and assignments
- **Domain Authority** for cross-account DNS delegation

#### Workload Pattern

Creates static website hosting infrastructure:

- **S3 + CloudFront** for content delivery
- **Domain Consumer** for subdomain management
- **Environment-Specific** deployments (nprd/prod)

## Architecture Layers

### Layer 0: Foundation Layer (Core)

- **Base Constructs**: Foundation for all AWS resource constructs
- **Auto-Tagging**: Automatic tagging applied to all resources
- **Auto-Naming**: Consistent naming conventions across all resources
- **Best Practices**: Built-in security and compliance patterns

### Layer 1: Application Layer

**Application Factories:**

- **Factory Functions**: `application/factories/app-factory.ts` - Main entry points
  (`createAutoApp`, `createManagementApp`, `createWorkloadApp`)
- **Factory Utilities**: `application/factories/factory-utils.ts` - Shared factory patterns

**Stage Registries:**

- **Management Registry**: `application/registry/management-stage-registry.ts` - Component-based
  stage registration
- **Workload Registry**: `application/registry/workload-stage-registry.ts` - Pattern-based stage
  registration
- **Registry Types**: `application/registry/stage-registry-types.ts` - Shared type definitions

**Stage Orchestration:**

- **Management Orchestrator**: `application/orchestration/management-orchestrator.ts` - Management
  stage creation logic
- **Workload Orchestrator**: `application/orchestration/workload-orchestrator.ts` - Workload stage
  creation logic
- **Base Orchestrator**: `application/orchestration/base-orchestrator.ts` - Shared orchestration
  patterns

**Configuration Management:**

- **App Configuration**: `application/config/app-config.ts` - Application-level configuration and
  validation
- **Factory Options**: `application/config/factory-options.ts` - Factory function option types and
  defaults

**Core Application:**

- **CDK Application**: `application/cdk-application.ts` - CDK application class with manifest
  loading

### Layer 2: Stage Layer (Orchestration)

- **Base Stages**: Provide common functionality and utilities
- **Standard Stages**: Implement specific patterns for each use case
- **Inheritance**: Standard stages extend base stages

### Layer 3: Stack Layer (Infrastructure Groups)

- **Management Stacks**: Organizations, Identity Center, Domain Delegation
- **Workload Stacks**: Static Hosting Domain, Static Hosting Frontend
- **Base Stacks**: Common stack functionality

### Layer 4: AWS Service Constructs (Reusable Components)

- **Individual AWS Services**: S3, CloudFront, Route53, ACM, Organizations, Identity Center
- **Built-in Patterns**: Each construct includes naming, tagging, and best practices
- **Maximum Reusability**: Can be composed by any stack for different use cases

## Usage

### Simple Auto-Detection Approach

```typescript
import { createAutoApp } from '@codeiqlabs/aws-cdk';

// Automatically detects type from manifest.yaml
createAutoApp().then((app) => app.synth());
```

### Type-Specific Approach

```typescript
import { createManagementApp, createWorkloadApp } from '@codeiqlabs/aws-cdk';

// Management account
createManagementApp().then((app) => app.synth());

// Workload account
createWorkloadApp().then((app) => app.synth());
```

### Advanced Usage with Direct Module Access

```typescript
// Direct factory access
import { createAutoApp } from '@codeiqlabs/aws-cdk/application/factories';

// Registry access for custom stage registration
import {
  ManagementStageRegistry,
  WorkloadStageRegistry,
} from '@codeiqlabs/aws-cdk/application/registry';

// Orchestrator access for custom orchestration
import {
  ManagementOrchestrator,
  WorkloadOrchestrator,
} from '@codeiqlabs/aws-cdk/application/orchestration';
```

## Modular Architecture Benefits

### Separation of Concerns

- **Factories**: Handle high-level application creation with clean public APIs
- **Registries**: Manage stage class registration and lookup with type safety
- **Orchestrators**: Coordinate between detection logic and stage creation
- **Configuration**: Centralize application-level configuration and validation

### Type Safety

- **Split Registries**: Management and workload stages use separate, type-safe registries
- **Dedicated Orchestrators**: Each manifest type has its own orchestrator with specific types
- **Clear Interfaces**: Well-defined interfaces between all components

### Extensibility

- **Plugin Architecture**: New stages can be registered without modifying core files
- **Pattern Independence**: Management components and workload patterns evolve independently
- **Future-Ready**: Architecture supports dynamic stage loading and external plugins

### Testability

- **Unit Testing**: Each module can be tested in isolation with clear dependencies
- **Mocking**: Orchestrators can be tested with mocked registries and detectors
- **Integration Testing**: Clean interfaces enable comprehensive integration testing

## Key Features

- **Zero Configuration**: Just create a manifest.yaml file
- **Type Safety**: Full TypeScript support with proper type inference
- **Standardized Naming**: Consistent resource naming across all infrastructure
- **Cross-Account Integration**: Automatic domain delegation between accounts
- **Environment Support**: Built-in support for multiple environments
- **Reusable Components**: High-level constructs for common patterns
- **Modular Design**: Clean separation of concerns with focused, testable modules
