# @codeiqlabs/aws-cdk

## 1.1.1

### Patch Changes

- e2fc7dd: Align CI/CD workflows and tooling with aws-utils patterns
  - Update GitHub Actions workflows to match aws-utils patterns (add push triggers, align job names)
  - Update dependencies to use proper versions instead of file references
    - @codeiqlabs/aws-utils: ^1.6.0 (was file:../codeiqlabs-aws-utils)
    - @codeiqlabs/eslint-prettier-config: ^1.6.0 (was file:../codeiqlabs-eslint-prettier-config)
  - Add optionalDependencies for Rollup platform packages to prevent CI build failures
  - Remove duplicate build step in release.yml workflow
  - Standardize CHANGELOG.md format to match aws-utils structure
  - Ensure consistent CI/CD patterns across all CodeIQLabs repositories

## 1.1.0

### Minor Changes

- fe427bd: feat: implement automated release infrastructure with dual module publishing
  - Added @changesets/cli for automated version management and release notes
  - Implemented dual ESM/CJS publishing with conditional exports for maximum compatibility
  - Added comprehensive GitHub Actions CI/CD workflows for pull request validation and automated
    releases
  - Integrated Husky pre-commit hooks with lint-staged for automatic code quality enforcement
  - Added comprehensive test suite validating both ESM and CJS module loading
  - Updated package.json with changeset-related scripts and enhanced build process
  - Added TypeScript configurations for dual builds (tsconfig.esm.json, tsconfig.cjs.json)
  - Enhanced documentation with contributing guidelines and release process documentation
  - Configured publishing to GitHub Packages with proper authentication and permissions

  This establishes the same sophisticated centralized code quality infrastructure used in the
  eslint-prettier-config repository, ensuring consistent development workflows and automated quality
  enforcement across all CodeIQLabs packages.

### Patch Changes

- 89ea225: Align CI/CD workflows and tooling with aws-utils patterns
  - Update GitHub Actions workflows to match aws-utils patterns (add push triggers, align job names)
  - Update dependencies to use proper versions instead of file references
    - @codeiqlabs/aws-utils: ^1.6.0 (was file:../codeiqlabs-aws-utils)
    - @codeiqlabs/eslint-prettier-config: ^1.6.0 (was file:../codeiqlabs-eslint-prettier-config)
  - Add optionalDependencies for Rollup platform packages to prevent CI build failures
  - Remove duplicate build step in release.yml workflow
  - Standardize CHANGELOG.md format to match aws-utils structure
  - Ensure consistent CI/CD patterns across all CodeIQLabs repositories

- f7f14e3: fix: configure GitHub Packages authentication for CI/CD workflows
  - Updated dependency reference from local file path to published GitHub Package Manager version
    ^1.4.1
  - Added .npmrc configuration for GitHub Packages registry authentication
  - Updated all GitHub Actions workflows (ci.yml, release.yml) to properly authenticate with GitHub
    Packages during npm install
  - Added NODE_AUTH_TOKEN environment variable to all dependency installation steps
  - Configured registry-url and scope for @codeiqlabs packages in workflow Node.js setup

  This ensures CI/CD pipelines can successfully install the centralized eslint-prettier-config
  package from GitHub Packages rather than relying on local file references.

- 7765310: fix: update eslint-prettier-config to v1.5.0 with modular architecture
  - Updated @codeiqlabs/eslint-prettier-config dependency from ^1.4.1 to ^1.5.0
  - Resolves ESLint 9.x compatibility issues with React plugin dependencies
  - Benefits from new modular configuration architecture with proper separation of concerns
  - Minimal configuration now has zero React dependencies, eliminating dependency conflicts
  - Enhanced TypeScript rules and better error handling for missing dependencies

  This resolves the ERESOLVE dependency conflicts that were preventing npm ci from succeeding.

- 7765310: fix: use custom GH_TOKEN for GitHub Packages authentication
  - Replaced GITHUB_TOKEN with GH_TOKEN secret for all npm package installations
  - The automatic GITHUB_TOKEN has limited permissions and cannot read packages from other
    repositories
  - GH_TOKEN is a custom Personal Access Token with proper read:packages permission
  - Updated all workflow jobs (CI and release) to use the custom token
  - This resolves the persistent 403 Forbidden errors when accessing
    @codeiqlabs/eslint-prettier-config

  The custom GH_TOKEN secret has the necessary permissions: read:packages, write:packages,
  delete:packages, and repo access.

## 1.0.1

### Patch Changes

- Align CI/CD workflows and tooling with aws-utils patterns
- Update dependencies to use proper versions instead of file references
- Add optionalDependencies for Rollup platform packages
- Standardize GitHub Actions workflows for consistent CI/CD
- Updated dependencies
  - @codeiqlabs/aws-utils@^1.6.0
  - @codeiqlabs/eslint-prettier-config@^1.6.0

## 1.0.0

### Major Changes

- Initial release of @codeiqlabs/aws-cdk package
- Reusable CDK constructs for CodeIQLabs infrastructure
- WorkloadBaseStack for standardized workload account stacks
- Automatic tagging and naming conventions
- SSM parameter management utilities
