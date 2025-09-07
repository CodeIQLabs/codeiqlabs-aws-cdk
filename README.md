# @codeiqlabs/aws-cdk

**Reusable AWS CDK library with pre-built stacks and declarative patterns** - A comprehensive
TypeScript library providing reusable stack implementations, constructs, and declarative stage
patterns that eliminate repetitive code and accelerate infrastructure development across any
organization's AWS projects.

## Key Features

- **Library-Provided Stacks**: Pre-built, reusable stack implementations for common infrastructure
  patterns
- **Declarative Stage Pattern**: Automatic stack creation with dependency resolution and conditional
  logic
- **Reusable Constructs**: Standardized constructs for AWS Organizations, Identity Center, and
  deployment permissions
- **Base Stack Classes**: Foundation classes for management and workload accounts with automatic
  tagging and naming
- **Type Safety**: Full TypeScript support with comprehensive type definitions and validation
- **Simplified Import Paths**: Clean, logical module organization for better developer experience
- **Dual Module Support**: Full ESM and CommonJS compatibility with modern tsup bundler

## 📦 Installation

```bash
# Using npm
npm install @codeiqlabs/aws-cdk

# Using yarn
yarn add @codeiqlabs/aws-cdk

# Using pnpm
pnpm add @codeiqlabs/aws-cdk
```

### Peer Dependencies

```bash
# Required peer dependencies
npm install aws-cdk-lib constructs @codeiqlabs/aws-utils
```

## 🛠️ Build System

This package uses **tsup** for modern dual ESM/CJS publishing:

- **Fast builds** with automatic optimization and tree-shaking
- **Source maps** for better debugging experience
- **Type definitions** automatically generated for both ESM and CJS
- **Modern bundler approach** following TypeScript library best practices

## Usage Examples

### Library-Provided Management Stacks

Use pre-built, reusable stack implementations for common infrastructure patterns:

```typescript
import {
  ManagementOrganizationsStack,
  ManagementIdentityCenterStack,
} from '@codeiqlabs/aws-cdk/stacks';
import { App } from 'aws-cdk-lib';

const app = new App();

// Pre-built Organizations stack
const orgStack = new ManagementOrganizationsStack(app, 'Organizations', {
  managementConfig: config,
  config: manifest,
  orgRootId: manifest.organization.rootId,
});

// Pre-built Identity Center stack with automatic dependency resolution
const identityStack = new ManagementIdentityCenterStack(app, 'IdentityCenter', {
  managementConfig: config,
  config: manifest,
  accountIds: orgStack.accountIds, // Automatic dependency injection
});
```

### Declarative Stage Pattern

Create stages that automatically manage stack creation and dependencies:

```typescript
import {
  DeclarativeManagementBaseStage,
  ManagementOrganizationsStack,
  ManagementIdentityCenterStack,
  type ManagementStackRegistration,
} from '@codeiqlabs/aws-cdk';

export class ManagementStage extends DeclarativeManagementBaseStage {
  constructor(scope: Construct, id: string, props: EnhancedManagementStageProps) {
    super(scope, id, props);
    this.createRegisteredStacks(); // One line creates all stacks!
  }

  protected registerStacks(): ManagementStackRegistration<any>[] {
    return [
      {
        stackClass: ManagementOrganizationsStack,
        component: 'Organizations',
        enabled: (manifest) => manifest.organization?.enabled === true,
        additionalProps: (manifest) => ({
          config: manifest,
          orgRootId: manifest.organization.rootId,
        }),
      },
      {
        stackClass: ManagementIdentityCenterStack,
        component: 'IdentityCenter',
        enabled: (manifest) => manifest.identityCenter?.enabled === true,
        dependencies: ['Organizations'], // Automatic dependency resolution
        additionalProps: (manifest, deps) => ({
          config: manifest,
          accountIds: (deps.Organizations as ManagementOrganizationsStack).accountIds,
        }),
      },
    ];
  }
}
```

### Base Stack Classes

Foundation classes for custom stack implementations:

```typescript
import { ManagementBaseStack, WorkloadBaseStack } from '@codeiqlabs/aws-cdk/stacks';

// Custom management account stack
class CustomManagementStack extends ManagementBaseStack {
  constructor(scope: Construct, id: string, props: ManagementBaseStackProps) {
    super(scope, id, 'CustomComponent', props);
    // Automatic tagging and naming already applied
  }
}

new MyWorkloadStack(app, 'MyWorkloadStack', {
  naming: new ResourceNaming({ project: 'MyProject', environment: 'nprd' }),
  description: 'MyProject non-production infrastructure',
});
```

### L1 Constructs - Deployment Permissions

Standardized cross-account roles and GitHub OIDC setup:

```typescript
import { DeploymentPermissionsConstruct } from '@codeiqlabs/aws-cdk';

const deploymentPermissions = new DeploymentPermissionsConstruct(this, 'DeploymentPermissions', {
  naming: this.naming,
  projects: [
    {
      name: 'MyProject',
      environments: ['nprd', 'prod'],
      github: {
        organization: 'MyOrganization',
        repository: 'myproject-infrastructure',
      },
    },
  ],
  trustedManagementAccountId: '123456789012',
});
```

### L1 Constructs - Organizations

AWS Organizations setup with OUs and accounts:

```typescript
import { OrganizationsConstruct } from '@codeiqlabs/aws-cdk';

const organizations = new OrganizationsConstruct(this, 'Organizations', {
  naming: this.naming,
  organizationalUnits: [
    {
      name: 'MyOrganization',
      accounts: [
        { name: 'Management', email: 'aws-mgmt@myorganization.com' },
        { name: 'NonProd', email: 'aws-np@myorganization.com' },
        { name: 'Prod', email: 'aws-prod@myorganization.com' },
      ],
    },
    {
      name: 'MyProject',
      accounts: [
        { name: 'NonProd', email: 'myproject-np@myorganization.com' },
        { name: 'Prod', email: 'myproject-prod@myorganization.com' },
      ],
    },
  ],
});
```

### L1 Constructs - Identity Center

AWS SSO permission sets and assignments:

```typescript
import { IdentityCenterConstruct } from '@codeiqlabs/aws-cdk';

const identityCenter = new IdentityCenterConstruct(this, 'IdentityCenter', {
  naming: this.naming,
  permissionSets: [
    {
      name: 'AdminAccess',
      description: 'Full administrative access',
      managedPolicies: ['arn:aws:iam::aws:policy/AdministratorAccess'],
    },
    {
      name: 'ReadOnlyAccess',
      description: 'Read-only access across all services',
      managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
    },
  ],
  assignments: [
    {
      principalType: 'GROUP',
      principalName: 'Administrators',
      permissionSetName: 'AdminAccess',
      targetType: 'AWS_ACCOUNT',
      targetId: '123456789012',
    },
  ],
});
```

### Standardized Tagging

Automatic tagging with consistent patterns:

```typescript
import { applyStandardTags } from '@codeiqlabs/aws-cdk';

// Apply to any CDK construct
applyStandardTags(myConstruct, {
  project: 'MyProject',
  environment: 'nprd',
  component: 'API',
  owner: 'Platform Team',
  company: 'MyOrganization',
  extraTags: {
    CostCenter: 'Engineering',
  },
});
```

## 🏗️ Architecture

### Repository Structure

```
src/
├── l1/                     # Level 1 abstractions
│   └── cdk/               # CDK wrapper utilities
│       ├── deployment-permissions/  # Cross-account roles & GitHub OIDC
│       ├── identity-center/         # AWS SSO constructs
│       ├── organizations/           # AWS Organizations constructs
│       ├── outputs/                 # CloudFormation output utilities
│       ├── ssm/                     # SSM parameter utilities
│       └── stacks/                  # Base stack classes
├── l2/                     # Level 2 abstractions (future)
├── common/                 # Shared utilities
│   └── tagging/           # Tagging functions and utilities
└── index.ts               # Main entry point
```

### Level 1 (L1) Constructs

**Thin wrappers** around AWS CDK constructs providing:

- Standardized naming and tagging patterns
- Consistent SSM parameter and CloudFormation output creation
- Type-safe configuration with validation
- Reusable patterns for common AWS resources

**Available L1 Constructs:**

- **Deployment Permissions** - Cross-account roles and GitHub OIDC providers
- **Identity Center** - AWS SSO permission sets and assignments
- **Organizations** - AWS Organizations, OUs, and accounts
- **SSM Parameters** - Standardized parameter creation and management
- **Base Stacks** - Pre-configured stack classes with consistent patterns
- **Outputs** - CloudFormation output utilities with naming conventions

### Level 2 (L2) Constructs (Future)

**Higher-level patterns** combining multiple L1 constructs:

- Complete application stacks (S3 + CloudFront + API Gateway)
- Database clusters with monitoring and backup
- CI/CD pipeline constructs
- Multi-environment deployment patterns

## 🏷️ Module Formats

This package supports both ESM and CommonJS with automatic dual publishing:

### ESM (Recommended)

```typescript
import {
  ManagementBaseStack,
  WorkloadBaseStack,
  DeploymentPermissionsConstruct,
  applyStandardTags,
} from '@codeiqlabs/aws-cdk';
```

### CommonJS

```javascript
const {
  ManagementBaseStack,
  WorkloadBaseStack,
  DeploymentPermissionsConstruct,
  applyStandardTags,
} = require('@codeiqlabs/aws-cdk');
```

## 🔧 Development

### Prerequisites

- Node.js 18+
- npm 9+
- TypeScript 5+
- AWS CDK 2.123.0+

### Setup

```bash
# Clone the repository
git clone https://github.com/CodeIQLabs/codeiqlabs-aws-cdk.git
cd codeiqlabs-aws-cdk

# Install dependencies
npm install

# Build the package (dual ESM/CJS with tsup)
npm run build

# Run tests
npm run test:all

# Lint and format
npm run lint
npm run format
```

### Build Commands

```bash
# Clean build artifacts
npm run clean

# Build with tsup (ESM + CJS + types + source maps)
npm run build:bundle

# Full build pipeline (clean + bundle + lint)
npm run build

# Development watch mode
npm run dev
```

## 🧪 Testing

```bash
# Run all tests (CJS + ESM import tests)
npm run test:all

# Run individual test suites
npm run test:load    # Configuration loading tests
npm run test:esm     # ESM import tests
```

## 🔗 Dependencies

### Core Dependencies

- **@codeiqlabs/aws-utils** - Core naming, validation, and configuration utilities
- **@codeiqlabs/eslint-prettier-config** - Centralized code quality configuration

### Peer Dependencies

- **aws-cdk-lib** - AWS CDK library (v2.123.0+)
- **constructs** - CDK constructs library

## 🔄 Integration with @codeiqlabs/eslint-prettier-config

This package uses the centralized ESLint and Prettier configuration:

```json
{
  "devDependencies": {
    "@codeiqlabs/eslint-prettier-config": "^1.5.0"
  }
}
```

The v1.5.0 release includes:

- **Modular architecture** with proper separation of concerns
- **ESLint 9.x compatibility** with updated React plugin versions
- **Zero dependency conflicts** with the new bundler approach
- **Enhanced TypeScript rules** and better error handling

## 🚀 Release Process

This package uses automated release management with changesets:

1. **Make changes** and create a changeset: `npm run changeset`
2. **Commit changes** with descriptive messages
3. **Create Pull Request** - CI validates builds and tests
4. **Merge PR** - Automated release workflow publishes to GitHub Packages

### Versioning

- **patch**: Bug fixes, documentation updates, internal refactoring
- **minor**: New constructs, new features, additive changes
- **major**: Breaking changes, removed constructs, changed APIs

## 📄 License

MIT - See [LICENSE](LICENSE) file for details.

---

**Part of the CodeIQLabs infrastructure ecosystem** - Accelerating AWS CDK development with
reusable, standardized constructs and patterns.
