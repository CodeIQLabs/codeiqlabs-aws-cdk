# @codeiqlabs/aws-cdk

AWS CDK wrapper utilities for CodeIQLabs projects, providing Level 1 and Level 2 abstractions that eliminate repetitive code and ensure consistent patterns across all infrastructure projects.

## Installation

```bash
npm install @codeiqlabs/aws-cdk
```

## Usage

### Import Everything
```typescript
import { ... } from '@codeiqlabs/aws-cdk';
```

### Import Only L1 Abstractions
```typescript
import { ... } from '@codeiqlabs/aws-cdk/l1';
```

### Import Only L2 Abstractions (Future)
```typescript
import { ... } from '@codeiqlabs/aws-cdk/l2';
```

## Structure

- **`src/l1/`** - Level 1 abstractions (thin wrappers around AWS CDK constructs)
- **`src/l2/`** - Level 2 abstractions (higher-level patterns combining multiple L1 constructs)
- **`src/common/`** - Shared utilities used across both abstraction levels

## Level 1 Abstractions

Level 1 abstractions provide:
- Standardized naming and tagging patterns
- Consistent SSM parameter and CloudFormation output creation
- Type-safe configuration with validation
- Reusable patterns for common AWS resources

### Available L1 Constructs

- **Identity Center** - AWS SSO permission sets and assignments
- **Organizations** - AWS Organizations, OUs, and accounts
- **SSM Parameters** - Standardized parameter creation
- **Stacks** - Base stack classes with consistent patterns
- **Outputs** - CloudFormation output utilities
- **Tagging** - Standardized tagging functions

## Level 2 Abstractions (Future)

Level 2 abstractions will provide complete application patterns:
- Web application stacks (S3 + CloudFront + API Gateway)
- Database clusters with monitoring and backup
- CI/CD pipeline constructs
- Multi-environment deployment patterns

## Dependencies

This package depends on:
- `@codeiqlabs/aws-utils` - Core naming and validation utilities
- `aws-cdk-lib` - AWS CDK library (peer dependency)
- `constructs` - CDK constructs library (peer dependency)

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Lint the code
npm run lint

# Fix linting issues
npm run lint:fix
```

## Repository Structure

```
src/
├── l1/                 # Level 1 abstractions
│   └── cdk/           # CDK wrapper utilities
├── l2/                 # Level 2 abstractions (future)
├── common/             # Shared utilities
│   └── tagging/       # Tagging functions
└── index.ts           # Main entry point
```

## License

MIT
