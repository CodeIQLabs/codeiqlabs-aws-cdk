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

## Module Formats

This package supports both ESM and CommonJS with dual publishing:

### ESM (Recommended)

```typescript
import { ManagementBaseStack, WorkloadBaseStack } from '@codeiqlabs/aws-cdk';
import { DeploymentPermissionsConstruct } from '@codeiqlabs/aws-cdk/l1';
```

### CommonJS

```javascript
const { ManagementBaseStack, WorkloadBaseStack } = require('@codeiqlabs/aws-cdk');
const { DeploymentPermissionsConstruct } = require('@codeiqlabs/aws-cdk/l1');
```

## Development

```bash
# Install dependencies
npm install

# Build the package (dual ESM/CJS)
npm run build

# Run tests
npm run test:all

# Lint the code
npm run lint

# Format the code
npm run format

# Create a changeset for your changes
npm run changeset
```

## Contributing

This package uses automated release management with changesets and enforced code quality:

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Update source files in `src/`
   - Add tests if applicable
   - Update documentation

3. **Test your changes**
   ```bash
   npm run build
   npm run test:all
   npm run format:check
   ```

4. **Create a changeset**
   ```bash
   npm run changeset
   ```
   - Select the appropriate change type (patch/minor/major)
   - Write a clear, descriptive summary

5. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**
   - The CI workflow will automatically validate your changes
   - Ensure you have included a changeset file
   - Wait for review and approval

### Release Process

The release process is fully automated:

1. **Pull Request Merged** → Triggers release workflow
2. **Changesets Action** either:
   - Creates/updates a "Version Packages" PR (if changesets exist)
   - Publishes the package (if Version Packages PR was merged)

### Pre-commit Hooks

This repository uses Husky and lint-staged to automatically:
- Run ESLint and fix issues
- Format code with Prettier
- Validate TypeScript compilation

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

## Versioning & Releases

We use Changesets with SemVer:

- **patch**: Bug fixes, documentation updates, internal refactoring
- **minor**: New features, new constructs, additive changes
- **major**: Breaking changes, removed features, changed APIs

Publishing targets GitHub Packages. Consumers pulling from GitHub Packages must configure their `.npmrc` accordingly.

## License

MIT
