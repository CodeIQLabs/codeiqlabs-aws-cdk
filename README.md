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

## Installation

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

## Build System

This package uses **tsup** for modern dual ESM/CJS publishing:

- **Fast builds** with automatic optimization and tree-shaking
- **Source maps** for better debugging experience
- **Type definitions** automatically generated for both ESM and CJS
- **Modern bundler approach** following TypeScript library best practices

## Usage Examples

The library provides **two distinct usage patterns** for consuming library-provided management stacks. Choose the approach that best fits your project's complexity and requirements:

### Option A: Direct Stack Usage (Imperative)

**Best for:** Simple scenarios, prototyping, or when you need full control over stack instantiation and dependency management.

**Benefits:** Maximum flexibility, explicit control, easy to understand and debug.

Use pre-built, reusable stack implementations directly in your CDK applications:

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

// Pre-built Identity Center stack with manual dependency injection
const identityStack = new ManagementIdentityCenterStack(app, 'IdentityCenter', {
  managementConfig: config,
  config: manifest,
  accountIds: orgStack.accountIds, // Manual dependency injection
});
```

### Option B: Declarative Stage Pattern

**Best for:** Complex scenarios, production environments, or when you want automatic dependency resolution and conditional logic.

**Benefits:** Automatic orchestration, dependency resolution, conditional stack creation, reduced boilerplate code.

Create stages that automatically manage stack creation, dependencies, and conditional logic based on manifest configuration:

```typescript
import type { Construct } from 'constructs';
import {
  DeclarativeManagementBaseStage,
  ManagementOrganizationsStack,
  ManagementIdentityCenterStack,
  type ManagementStackRegistration,
  type EnhancedManagementStageProps,
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

**Choosing Between Patterns:**
- **Use Option A (Direct)** when you need explicit control, are building simple applications, or want to understand exactly what's happening
- **Use Option B (Declarative)** when you want automatic orchestration, have complex dependency chains, or need conditional stack creation based on configuration

Both patterns use the same underlying library-provided stacks, so you can start with Option A and migrate to Option B as your requirements grow.

### Base Stack Classes

Foundation classes for custom stack implementations:

```typescript
import type { Construct } from 'constructs';
import {
  ManagementBaseStack,
  WorkloadBaseStack,
  type ManagementBaseStackProps,
  type WorkloadBaseStackProps
} from '@codeiqlabs/aws-cdk/stacks';

// Custom management account stack
class CustomManagementStack extends ManagementBaseStack {
  constructor(scope: Construct, id: string, props: ManagementBaseStackProps) {
    super(scope, id, 'CustomComponent', props);
    // Automatic tagging and naming already applied
  }
}

// Custom workload account stack
class CustomWorkloadStack extends WorkloadBaseStack {
  constructor(scope: Construct, id: string, props: WorkloadBaseStackProps) {
    super(scope, id, 'CustomComponent', props);
    // Automatic tagging and naming already applied
  }
}
```

### Deployment Permissions Construct

Standardized cross-account roles and GitHub OIDC setup:

```typescript
import { DeploymentPermissionsConstruct } from '@codeiqlabs/aws-cdk/constructs';

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

### Organizations Construct

AWS Organizations setup with OUs and accounts:

```typescript
import { OrganizationConstruct } from '@codeiqlabs/aws-cdk/constructs';

const organizations = new OrganizationConstruct(this, 'Organizations', {
  naming: this.naming,
  mode: 'create', // or 'adopt'
  rootId: 'r-1234567890',
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
  featureSet: 'ALL',
});
```

### Identity Center Construct

AWS SSO permission sets and assignments:

```typescript
import { IdentityCenterConstruct } from '@codeiqlabs/aws-cdk/constructs';

const identityCenter = new IdentityCenterConstruct(this, 'IdentityCenter', {
  naming: this.naming,
  instanceArn: 'arn:aws:sso:::instance/ssoins-1234567890abcdef',
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
  accountIds: { Management: '123456789012' },
  owner: 'Platform Team',
  company: 'MyOrganization',
});
```

### Standardized Tagging

Automatic tagging with consistent patterns:

```typescript
import { applyStandardTags } from '@codeiqlabs/aws-cdk/common';

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

## Architecture

### Repository Structure

```
src/
├── application/            # Application bootstrap utilities
│   ├── cdk-application.ts # CdkApplication class for automatic manifest loading
│   ├── stage-factory.ts   # Stage factory for creating stages
│   └── types.ts           # Application-related types
├── stacks/                # Stack classes
│   ├── base/              # Base stack classes
│   │   ├── management-base.ts  # ManagementBaseStack
│   │   └── workload-base.ts    # WorkloadBaseStack
│   └── management/        # Library-provided management stacks
│       ├── organizations-stack.ts     # ManagementOrganizationsStack
│       └── identity-center-stack.ts   # ManagementIdentityCenterStack
├── constructs/            # Reusable CDK constructs
│   ├── organizations/     # AWS Organizations constructs
│   ├── identity-center/   # AWS Identity Center (SSO) constructs
│   └── deployment-permissions/  # Cross-account roles & GitHub OIDC
├── stages/                # Stage classes with declarative patterns
│   ├── management-base-stage.ts           # ManagementBaseStage
│   ├── workload-base-stage.ts             # WorkloadBaseStage
│   ├── declarative-management-base-stage.ts  # DeclarativeManagementBaseStage
│   └── declarative-types.ts               # Declarative pattern types
├── common/                # Shared utilities
│   ├── tagging/           # Tagging functions and utilities
│   ├── ssm/               # SSM parameter utilities
│   ├── outputs/           # CloudFormation output utilities
│   └── aspects/           # CDK aspects
└── index.ts               # Main entry point
```

### Library-Provided Stacks

**Pre-built, reusable stack implementations** for common infrastructure patterns:

- **ManagementOrganizationsStack** - Complete AWS Organizations setup with OUs and accounts
- **ManagementIdentityCenterStack** - AWS Identity Center (SSO) with permission sets and assignments
- **BaseStack + L2 Construct Pattern** - Each stack wraps a single high-level construct with minimal business logic

**Benefits:**
- Eliminates 60-70% of boilerplate code in consuming applications
- Ensures consistent patterns across all management accounts
- Centralized maintenance and improvements
- Type-safe configuration with comprehensive validation

### Declarative Stage Pattern

**Automatic stack creation with dependency resolution:**

- **DeclarativeManagementBaseStage** - Orchestrates stack creation based on registrations
- **ManagementStackRegistration** - Type-safe stack registration interface
- **Automatic Features** - Conditional creation, dependency injection, error handling

**Benefits:**
- Applications become pure orchestration layers
- Automatic dependency resolution between stacks
- Conditional stack creation based on manifest configuration
- Comprehensive error handling and validation

### Reusable Constructs

**Standardized CDK constructs** providing consistent patterns:

- **Organizations** - AWS Organizations, OUs, and accounts with SSM parameters
- **Identity Center** - AWS SSO permission sets and assignments
- **Deployment Permissions** - Cross-account roles and GitHub OIDC providers
- **SSM Parameters** - Standardized parameter creation and management
- **Outputs** - CloudFormation output utilities with naming conventions

All constructs follow these principles:
- Standardized naming and tagging patterns
- Consistent SSM parameter and CloudFormation output creation
- Type-safe configuration with validation
- Reusable patterns for common AWS resources

## Module Formats

This package supports both ESM and CommonJS with automatic dual publishing:

### ESM (Recommended)

```typescript
// Library-provided stacks
import {
  ManagementOrganizationsStack,
  ManagementIdentityCenterStack
} from '@codeiqlabs/aws-cdk/stacks';

// Base stack classes
import { ManagementBaseStack, WorkloadBaseStack } from '@codeiqlabs/aws-cdk/stacks';

// Constructs
import { DeploymentPermissionsConstruct } from '@codeiqlabs/aws-cdk/constructs';

// Utilities
import { applyStandardTags } from '@codeiqlabs/aws-cdk/common';

// Stage classes
import { DeclarativeManagementBaseStage } from '@codeiqlabs/aws-cdk/stages';
```

### CommonJS

```javascript
// Library-provided stacks
const {
  ManagementOrganizationsStack,
  ManagementIdentityCenterStack
} = require('@codeiqlabs/aws-cdk/stacks');

// Base stack classes
const { ManagementBaseStack, WorkloadBaseStack } = require('@codeiqlabs/aws-cdk/stacks');

// Constructs
const { DeploymentPermissionsConstruct } = require('@codeiqlabs/aws-cdk/constructs');

// Utilities
const { applyStandardTags } = require('@codeiqlabs/aws-cdk/common');
```

## Development

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

## Testing

```bash
# Run all tests (CJS + ESM import tests)
npm run test:all

# Run individual test suites
npm run test:load    # Configuration loading tests
npm run test:esm     # ESM import tests
```

## Dependencies

### Core Dependencies

- **@codeiqlabs/aws-utils** - Core naming, validation, and configuration utilities
- **@codeiqlabs/eslint-prettier-config** - Centralized code quality configuration

### Peer Dependencies

- **aws-cdk-lib** - AWS CDK library (v2.123.0+)
- **constructs** - CDK constructs library

## Integration with @codeiqlabs/eslint-prettier-config

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

## Release Process

This package uses automated release management with changesets:

1. **Make changes** and create a changeset: `npm run changeset`
2. **Commit changes** with descriptive messages
3. **Create Pull Request** - CI validates builds and tests
4. **Merge PR** - Automated release workflow publishes to GitHub Packages

### Versioning

- **patch**: Bug fixes, documentation updates, internal refactoring
- **minor**: New constructs, new features, additive changes
- **major**: Breaking changes, removed constructs, changed APIs

## License

MIT - See [LICENSE](LICENSE) file for details.

---

**Part of the CodeIQLabs infrastructure ecosystem** - Accelerating AWS CDK development with
reusable, standardized constructs and patterns.
