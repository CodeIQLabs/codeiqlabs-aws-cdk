---
inclusion: always
---

# CDK Library Build Guidelines

## Overview

This is a shared CDK library consumed by:

- `codeiqlabs-management-aws`
- `codeiqlabs-customization-aws`
- `codeiqlabs-saas-aws`

## Build Process

### Build Command

```bash
pnpm run build
```

This runs:

1. TypeScript compilation (`tsc`)
2. Generates `dist/` directory with compiled JavaScript

### Watch Mode (Development)

```bash
pnpm run watch
```

Automatically rebuilds on file changes.

## After Making Changes

**CRITICAL**: After ANY code change, you MUST:

1. **Build this library**:

```bash
cd codeiqlabs-aws-cdk
pnpm run build
```

2. **Reinstall in consuming repos**:

```bash
cd ../codeiqlabs-saas-aws
pnpm install
```

3. **Verify changes**:

```bash
npx cdk synth --profile codeiqlabs-saas-admin-nprd
```

## Why This Matters

- This library is linked via `workspace:*` protocol in pnpm
- Changes don't take effect until rebuilt and reinstalled
- TypeScript compiles successfully but fails at runtime if stale

## Package Structure

```
codeiqlabs-aws-cdk/
├── src/
│   ├── constructs/     # Reusable L3 constructs
│   ├── stacks/         # Stack definitions
│   ├── stages/         # Pipeline stages
│   ├── application/    # Orchestrators
│   └── index.ts        # Public exports
├── dist/               # Compiled output (gitignored)
├── package.json
└── tsconfig.json
```

## Exports

All public APIs are exported from `src/index.ts`:

```typescript
// Constructs
export * from './constructs/my-construct';

// Stacks
export * from './stacks/my-stack';

// Utilities
export * from './utils/my-util';
```

## Versioning

This library uses semantic versioning:

- **Major**: Breaking changes
- **Minor**: New features (backward compatible)
- **Patch**: Bug fixes

Update version in `package.json` before publishing.

## Testing

### Run Tests

```bash
pnpm test
```

### Run Tests in Watch Mode

```bash
pnpm test:watch
```

### Test Coverage

```bash
pnpm test:coverage
```

## Linting

### Run Linter

```bash
pnpm lint
```

### Fix Linting Issues

```bash
pnpm lint:fix
```

## Pre-Commit Hooks

Husky runs `lint-staged` on pre-commit:

- Lints staged files
- Prevents commits with linting errors

## Dependencies

### Core Dependencies

- `aws-cdk-lib` - AWS CDK library
- `constructs` - CDK constructs base
- `@codeiqlabs/aws-utils` - Shared utilities

### Peer Dependencies

Consuming repos must have:

- `aws-cdk-lib`
- `constructs`

## Troubleshooting

### "Cannot find module '@codeiqlabs/aws-cdk'"

**Cause**: Library not built or not installed **Fix**: Run build + reinstall in consuming repo

### Changes not taking effect

**Cause**: Stale build **Fix**: Rebuild library and reinstall in consuming repo

### TypeScript errors in consuming repo

**Cause**: Type definitions out of sync **Fix**: Rebuild library and reinstall

## Anti-Patterns

- ❌ Don't commit `dist/` directory - it's gitignored
- ❌ Don't skip rebuilding after changes
- ❌ Don't forget to reinstall in consuming repos
- ❌ Don't export internal utilities - keep API surface small
- ❌ Don't break backward compatibility without major version bump
