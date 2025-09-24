# Supported Infrastructure Patterns

This document describes the two core infrastructure patterns supported by the `@codeiqlabs/aws-cdk`
package. These patterns are automatically detected from your `manifest.yaml` file and deployed using
standardized, reusable components.

## Pattern 1: Management Account Infrastructure

### **Purpose**

Create foundational organizational infrastructure for AWS multi-account environments.

### **Pattern Type**

`type: "management"`

### **Domain Role**

**Domain Authority** - Owns and manages parent domains, delegates subdomains to workload accounts.

### **Infrastructure Components**

#### **AWS Organizations**

- **Organizational Units (OUs)**: Logical grouping of AWS accounts
- **Member Accounts**: Individual AWS accounts for different environments/workloads
- **Service Control Policies (SCPs)**: Governance and compliance policies

#### **Identity Center SSO**

- **Permission Sets**: Standardized IAM permission templates
- **Account Assignments**: User/group access to specific accounts and roles
- **User Management**: Centralized identity and access management

#### **Domain Authority**

- **Route53 Hosted Zones**: Parent domain management (e.g., `codeiqlabs.com`)
- **Cross-Account NS Records**: Subdomain delegation to workload accounts
- **DNS Management**: Centralized domain authority and delegation

### **Example Manifest**

```yaml
type: 'management'
project: 'CodeIQLabs'
company: 'CodeIQLabs'
domain:
  name: 'codeiqlabs.com'
  hostedZoneId: 'Z1234567890ABC'
organizationalUnits:
  - name: 'Production'
    accounts:
      - name: 'prod-account'
        id: '123456789012'
  - name: 'Non-Production'
    accounts:
      - name: 'staging-account'
        id: '123456789013'
```

### **Deployment Result**

- Complete AWS Organizations setup with OUs and accounts
- Identity Center SSO with permission sets and assignments
- Route53 hosted zone for parent domain with delegation capabilities
- Cross-account IAM roles for subdomain delegation

### **Implementation Flow**

```mermaid
graph TD
    A[manifest.yaml] --> B{**Auto-Detection**<br/>application/factories/app-factory.ts}

    B -->|Management Type| C[**Management Pattern**]

    C --> D[**ManagementOrchestrator**<br/>application/orchestration/management-orchestrator.ts]
    D --> E[**Component Detection**<br/>detection/management-detector.ts]
    E --> F[**Stage Registry Lookup**<br/>application/registry/management-stage-registry.ts]
    F --> G[**Stage Creation**<br/>stages/management/]

    G --> H[**Organizations Stage**<br/>stages/management/organizations-stage.ts]
    G --> I[**Identity Center Stage**<br/>stages/management/identity-center-stage.ts]
    G --> J[**Domain Authority Stage**<br/>stages/management/domain-authority-stage.ts]

    H --> H1[**Organizations Stack**<br/>stacks/management/organizations-stack.ts]
    I --> I1[**Identity Center Stack**<br/>stacks/management/identity-center-stack.ts]
    J --> J1[**Domain Delegation Stack**<br/>stacks/management/domain-delegation-stack.ts]

    H1 --> H2[**Organizational Units**<br/>constructs/organizations/constructs.ts]
    H1 --> H3[**Member Accounts**<br/>constructs/organizations/constructs.ts]
    H1 --> H4[**Service Control Policies**<br/>constructs/organizations/constructs.ts]

    I1 --> I2[**Permission Sets**<br/>constructs/identity-center/constructs.ts]
    I1 --> I3[**Account Assignments**<br/>constructs/identity-center/constructs.ts]
    I1 --> I4[**User Management**<br/>constructs/identity-center/constructs.ts]

    J1 --> J2[**Route53 Hosted Zones**<br/>constructs/route53/constructs.ts]
    J1 --> J3[**Parent Domain Management**<br/>constructs/route53/constructs.ts]
    J1 --> J4[**Cross-Account NS Records**<br/>constructs/route53/constructs.ts]

    classDef manifest fill:#e1f5fe,stroke:#01579b,stroke-width:3px
    classDef orchestration fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef stages fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef stacks fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef constructs fill:#fce4ec,stroke:#880e4f,stroke-width:2px

    class A manifest
    class C,D,E,F orchestration
    class G,H,I,J stages
    class H1,I1,J1 stacks
    class H2,H3,H4,I2,I3,I4,J2,J3,J4 constructs
```

---

## Pattern 2: Static Website Infrastructure

### **Purpose**

Create S3 + CloudFront hosting infrastructure for React/static websites with custom domains.

### **Pattern Type**

`type: "workload"`

### **Domain Role**

**Domain Consumer** - Receives delegated subdomains from the management account.

### **Infrastructure Components**

#### **S3 Static Hosting**

- **S3 Bucket**: Static content storage with proper security configurations
- **Bucket Policies**: CloudFront Origin Access Identity (OAI) integration
- **Lifecycle Policies**: Automated content management

#### **CloudFront Distribution**

- **Global CDN**: Fast content delivery worldwide
- **SSL/TLS**: HTTPS enforcement and security headers
- **SPA Support**: Client-side routing support for React applications
- **Caching**: Optimized caching policies for static content

#### **Domain Consumer**

- **Route53 Hosted Zone**: Subdomain management (e.g., `myapp.codeiqlabs.com`)
- **ACM SSL Certificates**: Automatic SSL certificate provisioning and renewal
- **DNS Records**: A/AAAA records pointing to CloudFront distribution

#### **Environment-Specific Deployment**

- **Non-Production**: Staging/development environments
- **Production**: Live production environment
- **Cross-Account Integration**: Automatic subdomain delegation from management account

### **Example Manifest**

```yaml
type: 'workload'
project: 'MyApp'
company: 'CodeIQLabs'
environments:
  nprd:
    accountId: '123456789013'
    config:
      domain:
        name: 'staging.myapp.codeiqlabs.com'
        parentDomain: 'codeiqlabs.com'
        parentAccountId: '123456789010'
  prod:
    accountId: '123456789012'
    config:
      domain:
        name: 'myapp.codeiqlabs.com'
        parentDomain: 'codeiqlabs.com'
        parentAccountId: '123456789010'
```

### **Deployment Result**

- S3 bucket configured for static website hosting
- CloudFront distribution with custom domain and SSL
- Route53 hosted zone for subdomain with proper DNS records
- ACM SSL certificate for HTTPS
- Cross-account subdomain delegation from management account

### **Implementation Flow**

```mermaid
graph TD
    A[manifest.yaml] --> B{**Auto-Detection**<br/>application/factories/app-factory.ts}

    B -->|Workload Type| C[**Workload Pattern**]

    C --> D[**WorkloadOrchestrator**<br/>application/orchestration/workload-orchestrator.ts]
    D --> E[**Pattern Detection**<br/>detection/workload-detector.ts]
    E --> F[**Stage Registry Lookup**<br/>application/registry/workload-stage-registry.ts]
    F --> G[**Environment-Specific Stages**<br/>stages/workload/]

    G --> H[**Static Hosting Stage**<br/>stages/workload/static-hosting-stage.ts]

    H --> I[**Frontend Stack**<br/>stacks/workload/static-hosting-frontend-stack.ts]
    H --> J[**Domain Stack**<br/>stacks/workload/static-hosting-domain-stack.ts]

    I --> I1[**S3 Static Hosting**<br/>constructs/s3/constructs.ts]
    I --> I2[**CloudFront Distribution**<br/>constructs/cloudfront/constructs.ts]
    I --> I3[**SSL Certificates**<br/>constructs/acm/constructs.ts]

    J --> J1[**Subdomain Delegation**<br/>constructs/route53/constructs.ts]
    J --> J2[**Route53 Hosted Zone**<br/>constructs/route53/constructs.ts]
    J --> J3[**DNS Records**<br/>constructs/route53/constructs.ts]

    G --> K[**Environment Deployment**]
    K --> K1[**Non-Production Env**<br/>nprd environment]
    K --> K2[**Production Env**<br/>prod environment]

    classDef manifest fill:#e1f5fe,stroke:#01579b,stroke-width:3px
    classDef orchestration fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef stages fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef stacks fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef constructs fill:#fce4ec,stroke:#880e4f,stroke-width:2px

    class A manifest
    class C,D,E,F orchestration
    class G,H,K stages
    class I,J stacks
    class I1,I2,I3,J1,J2,J3,K1,K2 constructs
```

---

## Pattern Integration

### **Cross-Account Domain Delegation**

The two patterns work together to provide seamless domain management:

1. **Management Account** creates parent domain authority
2. **Workload Accounts** request subdomain delegation
3. **Automatic NS Record Creation** in parent hosted zone
4. **Subdomain Management** handled independently by workload accounts

### **Deployment Sequence**

1. **Deploy Management Account** - Creates organizational foundation
2. **Deploy Workload Accounts** - Creates application infrastructure with domain delegation

### **Security & Compliance**

- **Least Privilege IAM**: Minimal required permissions
- **Encryption**: S3 and CloudFront encryption enabled
- **Security Headers**: HTTPS enforcement and security headers
- **Access Logging**: CloudTrail and access logs enabled

---

## Usage

### **Auto-Detection Approach**

```typescript
import { createAutoApp } from '@codeiqlabs/aws-cdk';

// Automatically detects pattern from manifest.yaml
createAutoApp().then((app) => app.synth());
```

### **Pattern-Specific Approach**

```typescript
import { createManagementApp, createWorkloadApp } from '@codeiqlabs/aws-cdk';

// Management pattern
createManagementApp().then((app) => app.synth());

// Workload pattern
createWorkloadApp().then((app) => app.synth());
```

### **Advanced Modular Access**

```typescript
// Direct access to orchestrators for advanced use cases
import {
  ManagementOrchestrator,
  WorkloadOrchestrator,
} from '@codeiqlabs/aws-cdk/application/orchestration';
import {
  ManagementStageRegistry,
  WorkloadStageRegistry,
} from '@codeiqlabs/aws-cdk/application/registry';

// Custom orchestration
const managementOrchestrator = new ManagementOrchestrator();
const workloadOrchestrator = new WorkloadOrchestrator();

// Custom stage registration
const managementRegistry = new ManagementStageRegistry();
const workloadRegistry = new WorkloadStageRegistry();
```

### **Deployment Commands**

```bash
# Management account
cdk deploy --all --profile management-admin

# Workload account
cdk deploy --all --profile workload-admin
```

## Key Benefits

- **Standardized Patterns**: Consistent infrastructure across all projects
- **Auto-Detection**: Zero configuration - just create manifest.yaml
- **Modular Architecture**: Clean separation of concerns with focused modules
- **Type Safety**: Full TypeScript support with separate registries for management vs workload
- **Extensibility**: Easy to add new stages without modifying core orchestration
- **Testability**: Each component can be tested in isolation
- **Cross-Account Integration**: Seamless domain delegation
- **Best Practices**: Security, naming, and tagging built-in
- **Reusable Components**: Individual AWS service constructs for maximum flexibility
