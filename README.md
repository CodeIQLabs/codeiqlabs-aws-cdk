# @codeiqlabs/aws-cdk

**Component-based AWS CDK framework that auto-orchestrates Organizations, Identity Center, and
domain delegation from a manifest.**

[![GitHub package version](https://img.shields.io/github/package-json/v/CodeIQLabs/codeiqlabs-aws-cdk?label=version)](https://github.com/CodeIQLabs/codeiqlabs-aws-cdk/packages)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-18.0+-green.svg)](https://nodejs.org/)
[![AWS CDK](https://img.shields.io/badge/AWS%20CDK-2.213+-orange.svg)](https://aws.amazon.com/cdk/)

## Key Features

`@codeiqlabs/aws-cdk` is a CDK wrapper/framework that provides L2/L3 constructs and prebuilt stacks
for:

- **AWS Organizations** – Create OUs, accounts, and org policies
- **IAM Identity Center** – Users, groups, permission sets, and account assignments
- **Multi-Account Domain Management** – Route 53 hosted zones, CloudFront distributions, ACM
  certificates, and cross-account DNS delegation

**Key characteristics:**

- **Manifest-driven orchestration** – Uses a `manifest.yaml` to automatically create stacks based on
  enabled components (`organization`, `identityCenter`, `domains`)
- **Multi-account/multi-environment** – Targets complex setups with consistent naming and tagging
  via a unified `BaseStack`
- **Component-based architecture** – No manifestType routing; components define what gets deployed

**What this is NOT:**

This is not a turnkey landing zone product. It's an opinionated CDK toolkit you incorporate into
your own CDK apps to standardize infrastructure patterns.

## Installation

```bash
npm install @codeiqlabs/aws-cdk
```

## Features

| Component               | What You Get                                                                                                                            | Stacks                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Organizations**       | Create OUs and accounts<br>Apply org policies                                                                                           | `ManagementOrganizationsStack`                                                                                                                 |
| **Identity Center**     | Users, groups, permission sets<br>Account assignments                                                                                   | `ManagementIdentityCenterStack`                                                                                                                |
| **Domains & DNS**       | Hosted zones<br>ACM certificates (us-east-1)<br>WAF Web ACLs<br>CloudFront distributions<br>DNS records<br>Cross-account DNS delegation | `RootDomainStack`<br>`AcmAndWafStack` (us-east-1)<br>`CloudFrontDistributionStack` (us-east-1)<br>`DnsRecordsStack`<br>`DomainDelegationStack` |
| **Base Stack**          | Unified `BaseStack` with consistent naming, tagging, and environment validation                                                         | All stacks extend `BaseStack`                                                                                                                  |
| **Reusable Constructs** | L2/L3 constructs for ACM, CloudFront, Route 53, S3, Identity Center, Organizations, deployment permissions                              | Available in `src/constructs`                                                                                                                  |

> CloudFront and certificate management are delivered in two stages: `AcmAndWafStack` in us-east-1
> (certificates + WAF) and `CloudFrontDistributionStack` plus `DnsRecordsStack` for the distribution
> and DNS wiring. Older references to "CloudFrontAndCertStack" refer to this combined flow.

## How It Works (Concepts)

### Manifest-Driven

You declare which components are enabled in a `manifest.yaml`:

```yaml
project: 'MyProject'
company: 'MyCompany'

deployment:
  accountId: '123456789012'
  region: us-east-1

management:
  environment: mgmt

organization:
  enabled: true
  # ... org config

identityCenter:
  enabled: true
  # ... identity center config

domains:
  enabled: true
  # ... domain config

environments:
  nprd:
    accountId: '234567890123'
    region: us-east-1
  prod:
    accountId: '345678901234'
    region: us-east-1

networking:
  vpc:
    enabled: true
    # ... VPC config
```

### ComponentOrchestrator

The `ComponentOrchestrator` reads your config and creates the corresponding stacks automatically:

- Detects enabled components (`organization`, `identityCenter`, `domains`)
- Creates appropriate stacks for each component
- Handles cross-account dependencies and stack ordering
- No manifestType routing needed

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  Application Layer                      │
│  (CdkApplication, createApp() factory)  │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Orchestration Layer                    │
│  (ComponentOrchestrator)                │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Stacks Layer                           │
│  (Prebuilt stacks)                      │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Constructs Layer                       │
│  (Reusable L2/L3 constructs)            │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Core Layer                             │
│  (Naming/tagging base constructs)       │
└─────────────────────────────────────────┘
```

## Quick Start

### Minimal Example

Create a CDK bin file:

```typescript
// bin/app.ts
import { createApp } from '@codeiqlabs/aws-cdk';

async function main() {
  const app = await createApp({
    manifestPath: './manifest.yaml',
  });

  app.synth();
}

main();
```

Create a `manifest.yaml`:

```yaml
project: 'MyProject'
company: 'MyCompany'

deployment:
  accountId: '123456789012'
  region: us-east-1

management:
  environment: mgmt

organization:
  enabled: true
  rootId: 'r-abc123'
  organizationalUnits:
    - key: 'workloads'
      name: 'Workloads'
      accounts:
        - key: 'prod'
          name: 'Production'
          email: 'aws-prod@example.com'
          environment: 'prod'
```

Deploy:

```bash
cdk deploy --all
```

**That's it!** The framework will:

1. Read your manifest
2. Detect enabled components
3. Create all corresponding stacks automatically

### Sample Manifests

For complete examples of each stack type, see the [samples/](./samples/) directory:

- **[Organizations Stack](./samples/01-organizations-stack.yaml)** - AWS Organizations with OUs and
  accounts
- **[Identity Center Stack](./samples/02-identity-center-stack.yaml)** - SSO with users, groups, and
  permission sets
- **[Domain Delegation Stack](./samples/03-domain-delegation-stack.yaml)** - Route53 with
  cross-account DNS delegation
- **[Complete Management Account](./samples/04-complete-management-account.yaml)** - Full governance
  setup

Each sample includes detailed comments explaining all configuration options.

## Repository Structure

```
codeiqlabs-aws-cdk/
├── src/
│   ├── application/      # App factory, config, orchestration
│   ├── stacks/          # Prebuilt stacks (organizations, identity-center, domains, base)
│   ├── constructs/      # Reusable constructs (ACM, CloudFront, S3, Route 53, etc.)
│   └── core/            # Naming/tagging base constructs
├── samples/             # Sample manifest files for each stack type
├── tests/               # ESM/CommonJS integration tests
└── package.json
```

**Full reference:** See [Complete File Reference](./FILE-REFERENCE.md)

## Usage Patterns

### Common Scenarios

**1. Set up a new AWS organization with Identity Center**

Enable `organization` and `identityCenter` components in your manifest. The framework creates the
org structure, OUs, accounts, users, groups, and permission sets.

**2. Delegate DNS to workload accounts**

Enable `domains` to create hosted zones in the management account and delegate DNS management to
workload accounts.

**3. Standardize naming/tagging across stacks**

All stacks extend `BaseStack`, which provides consistent resource naming and tagging based on
environment, project, and company.

## Development

### Prerequisites

- Node.js 18+
- npm 9+
- TypeScript 5+
- AWS CDK 2.213.0+

### Setup

```bash
# Clone the repository
git clone https://github.com/CodeIQLabs/codeiqlabs-aws-cdk.git
cd codeiqlabs-aws-cdk

# Install dependencies
npm install

# Build the package (generates dist outputs and runs format/lint)
npm run build

# Run smoke tests (requires dist/ from the build)
npm run test:all

# Lint and format (available separately if needed)
npm run lint
npm run format
```

## 🧪 Testing

```bash
# Run all tests
npm run test:all

# Run CommonJS smoke test (requires built dist/)
npm run test:load

# Run ESM smoke test (requires built dist/)
npm run test:esm
```

## Status & Compatibility

- **Current Version:** 1.3.0
- **AWS CDK Compatibility:** v2.213.0+
- **Node.js:** 18.0.0+
- **TypeScript:** 5.0+
- **Stability:** Production-ready

**Release Notes:** See [CHANGELOG.md](./CHANGELOG.md)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT – See [LICENSE](./LICENSE) for details.

---

**Part of the CodeIQLabs infrastructure ecosystem** - Component-based AWS CDK framework for
manifest-driven infrastructure orchestration.
