# @codeiqlabs/aws-cdk

## 1.5.0

### Minor Changes

- a17e061: ### VPC Origins and Workload Infrastructure Stacks

  **New Customization Stacks:**
  - `InfraVpcStack` - VPC for CloudFront VPC origins with public/private subnets
  - `InfraAlbStack` - Internal ALB for VPC origin routing with header-based rules
  - `VpcOriginStack` - CloudFront VPC origin configuration
  - `SubdomainZoneStack` - Delegated subdomain hosted zones in management account
  - `OriginDomainStack` - Origin domain A records for ALB endpoints
  - `AlbDnsRecordStack` - ALB DNS records in delegated subdomain zones
  - `AlbHttpsListenerStack` - HTTPS listener with header-based routing rules
  - `WorkloadParamsStack` - SSM parameters for cross-account sharing

  **New Domain Stacks:**
  - `CloudFrontVpcOriginStack` - CloudFront distributions with VPC origins (replaces
    CloudFrontDistributionStack)
  - `StaticWebappStack` - S3 static hosting with CloudFront (moved from workload)

  **New Workload Stacks:**
  - `EcrRepositoryStack` - ECR repositories for container images

  **Updated Stacks:**
  - `GithubOidcStack` - Updated for targetEnvironments schema
  - `IdentityCenterStack` - Updated for compact assignments format
  - `OrganizationsStack` - Updated for convention-over-configuration
  - `BaseStack` - Added skipEnvironment support for stack naming

  **Breaking Changes:**
  - Removed `CloudFrontDistributionStack` - replaced by `CloudFrontVpcOriginStack`
  - Removed domain foundation/wireup stages - simplified to direct stack creation
  - Updated to @codeiqlabs/aws-utils@1.10.0 schema changes

## 1.4.0

### Minor Changes

- 53d9524: Add AuroraServerlessStack provisioning (serverless v2 PostgreSQL, SSM endpoint, SG
  ingress from ECS) and wire ECS API tasks to inject DATABASE*URL*\* secrets for all brands.

### Patch Changes

- db09567: Update dependencies: @codeiqlabs/aws-utils to ^1.9.0 and
  @codeiqlabs/eslint-prettier-config to ^1.11.2

## 1.3.0

### Minor Changes

- 58b13e0: **Library-Provided Stack Pattern Implementation**

  This major update introduces the Library-Provided Stack Pattern, transforming the aws-cdk package
  into a comprehensive library that provides reusable, pre-built stack implementations for common
  infrastructure patterns.

  **New Library-Provided Stacks:**
  - ManagementOrganizationsStack: Reusable AWS Organizations setup for any management account
  - ManagementIdentityCenterStack: Reusable AWS Identity Center (SSO) configuration
  - BaseStack + L2 Construct Pattern: Each stack wraps a single high-level construct with minimal
    business logic

  **Declarative Stack Registration System:**
  - DeclarativeManagementBaseStage: Automatic stack creation with dependency resolution
  - ManagementStackRegistration: Type-safe stack registration interface
  - Enhanced Features: Conditional creation, dependency injection, comprehensive error handling

  **Developer Experience Improvements:**
  - Simplified Applications: Consuming apps become pure orchestration layers (60-70% code reduction)
  - Improved Import Paths: @codeiqlabs/aws-cdk/stacks vs @codeiqlabs/aws-cdk/l1/cdk/stacks
  - Type Safety: Full TypeScript support with proper error messages

  **Architectural Restructuring:**
  - Directory Organization: Eliminated L1/L2 distinction, introduced logical grouping (src/stacks/,
    src/constructs/, src/stages/, src/common/)
  - Code Consolidation: Single source of truth for stack implementations
  - Enhanced Maintainability: Reduced duplication and clearer boundaries

  **Breaking Changes:**
  - Import paths updated from l1/cdk/\* to simplified structure
  - Removed BaseStage class, consolidated into specific stage classes
  - Complete reorganization of internal directory structure

## 1.3.0 - 2025-01-07

### Minor Changes

#### Library-Provided Stack Pattern Implementation

This major update introduces the Library-Provided Stack Pattern, transforming the aws-cdk package
into a comprehensive library that provides reusable, pre-built stack implementations for common
infrastructure patterns.

**New Library-Provided Stacks**

- **ManagementOrganizationsStack**: Reusable AWS Organizations setup for any management account
- **ManagementIdentityCenterStack**: Reusable AWS Identity Center (SSO) configuration
- **BaseStack + L2 Construct Pattern**: Each stack wraps a single high-level construct with minimal
  business logic

**Declarative Stack Registration System**

- **DeclarativeManagementBaseStage**: Automatic stack creation with dependency resolution
- **ManagementStackRegistration**: Type-safe stack registration interface
- **Enhanced Features**: Conditional creation, dependency injection, comprehensive error handling

**Developer Experience Improvements**

- **Simplified Applications**: Consuming apps become pure orchestration layers (60-70% code
  reduction)
- **Improved Import Paths**: `@codeiqlabs/aws-cdk/stacks` vs `@codeiqlabs/aws-cdk/l1/cdk/stacks`
- **Type Safety**: Full TypeScript support with proper error messages

**Architectural Restructuring**

- **Directory Organization**: Eliminated L1/L2 distinction, introduced logical grouping
  (`src/stacks/`, `src/constructs/`, `src/stages/`, `src/common/`)
- **Code Consolidation**: Single source of truth for stack implementations
- **Enhanced Maintainability**: Reduced duplication and clearer boundaries

**Breaking Changes**

- Import paths updated from `l1/cdk/*` to simplified structure
- Removed BaseStage class, consolidated into specific stage classes
- Complete reorganization of internal directory structure

## 1.2.1

### Patch Changes

- fcd004a: # Dependency Alignment and Peer Dependency Fixes

  This update resolves dependency conflicts and aligns AWS CDK versions across the CodeIQLabs
  ecosystem for clean npm installs without legacy peer dependency flags.

  ## **Dependency Fixes**

  ### **AWS CDK Version Alignment**
  - **aws-cdk-lib**: Updated from `^2.150.0` to `^2.213.0` to match aws-utils peer dependency
  - **aws-cdk**: Updated from `2.123.0` to `^2.213.0` for consistency
  - **Peer Dependencies**: Updated `aws-cdk-lib` peer dependency from `2.208.0` to `^2.213.0`

  ### **CodeIQLabs Package Alignment**
  - **@codeiqlabs/eslint-prettier-config**: Updated from `^1.8.0` to `^1.7.0` to match published
    version
  - **TypeScript ESLint**: Aligned to `^8.39.1` across ecosystem
  - **ESLint**: Updated to `^9.33.0` for consistency

  ## **Benefits**
  - **Clean npm install**: No more `--legacy-peer-deps` flag required
  - **Version consistency**: All AWS CDK packages use compatible versions
  - **Ecosystem alignment**: Consistent dependency versions across CodeIQLabs packages
  - **Workspace compatibility**: Maintains hybrid workspace + semantic versioning strategy
  - **Zero vulnerabilities**: Clean dependency tree with no security issues

  ## **Migration Notes**

  ### **For Consuming Packages**
  - Continue using `@codeiqlabs/aws-cdk: ^1.2.0` in your package.json
  - Ensure `aws-cdk-lib: ^2.213.0` is used consistently
  - Run `npm install` (no legacy flags needed)

  ### **Compatibility**
  - **Backward compatible**: No breaking changes to public APIs
  - **Workspace linking**: Continues to work seamlessly in development
  - **CI/CD builds**: Clean dependency resolution in all environments

  **Note**: This changeset documents dependency alignment changes for transparency. Version remains
  at 1.2.0 following library repository policy - versions are only incremented for actual code
  changes, not dependency updates.

## 1.2.1 - 2025-09-01

### Patch Changes

#### Dependency Alignment and Peer Dependency Fixes

This update resolves dependency conflicts and aligns AWS CDK versions across the CodeIQLabs
ecosystem for clean npm installs without legacy peer dependency flags.

**Note**: This changelog reflects the next expected version (1.2.1) based on changeset
specification. The actual package.json version remains at 1.2.0 following library repository
policy - versions are only incremented for actual code changes, not dependency updates.

#### **Dependency Fixes**

##### **AWS CDK Version Alignment**

- **aws-cdk-lib**: Updated from `^2.150.0` to `^2.213.0` to match aws-utils peer dependency
- **aws-cdk**: Updated from `2.123.0` to `^2.213.0` for consistency
- **Peer Dependencies**: Updated `aws-cdk-lib` peer dependency from `2.208.0` to `^2.213.0`

##### **CodeIQLabs Package Alignment**

- **@codeiqlabs/eslint-prettier-config**: Updated from `^1.8.0` to `^1.7.0` to match published
  version
- **TypeScript ESLint**: Aligned to `^8.39.1` across ecosystem
- **ESLint**: Updated to `^9.33.0` for consistency

#### **Benefits**

- **Clean npm install**: No more `--legacy-peer-deps` flag required
- **Version consistency**: All AWS CDK packages use compatible versions
- **Ecosystem alignment**: Consistent dependency versions across CodeIQLabs packages
- **Workspace compatibility**: Maintains hybrid workspace + semantic versioning strategy
- **Zero vulnerabilities**: Clean dependency tree with no security issues

## 1.2.0

### Minor Changes

- 4b312b3: # CDK Application Bootstrap Consolidation and CI/CD Alignment v1.1.1

  This release introduces the comprehensive CDK Application Bootstrap Consolidation feature and
  aligns CI/CD workflows with aws-utils patterns, delivering significant improvements to developer
  experience and infrastructure automation.

  ## **Major Features**

  ### **CDK Application Bootstrap Consolidation**
  - **CdkApplication Class**: Automatic manifest loading, validation, and configuration with
    intelligent type detection
  - **Enhanced Base Stage Classes**: ManagementBaseStage and WorkloadBaseStage with automatic
    configuration transformation
  - **StageFactory Utilities**: Standardized stage creation with automatic naming and environment
    handling
  - **Application Bootstrap Module**: Complete application initialization utilities eliminating
    68-84% of manual bootstrap code

  ### **Enhanced Developer Experience**
  - **Automatic Configuration Transformation**: ManifestConfigAdapter integration for seamless
    manifest-to-stack configuration
  - **Type-Safe Interfaces**: Comprehensive TypeScript support with enhanced error handling
  - **Standardized Patterns**: Consistent application bootstrap across all infrastructure
    repositories
  - **Built-in Validation**: Context-aware error messages with actionable guidance

  ## **CI/CD and Tooling Improvements**

  ### **Workflow Alignment**
  - **GitHub Actions**: Updated workflows tol
  - match aws-utils patterns with push triggers and aligned job names
  - **Dependency Management**: Updated to use proper versions instead of file references
    - @codeiqlabs/aws-utils: ^1.7.0 (was file:../codeiqlabs-aws-utils)
    - @codeiqlabs/eslint-prettier-config: ^1.6.0 (was file:../codeiqlabs-eslint-prettier-config)
  - **Build Optimization**: Added optionalDependencies for Rollup platform packages to prevent CI
    build failures
  - **Release Process**: Removed duplicate build steps and standardized release workflow

  ### **Documentation and Standards**
  - **CHANGELOG.md**: Standardized format to match aws-utils structure
  - **Consistent Patterns**: Ensured uniform CI/CD patterns across all CodeIQLabs repositories
  - **Enhanced Documentation**: Comprehensive usage examples and migration guidance

  ## **Benefits Summary**
  - **68-84% reduction** in CDK application bootstrap code
  - **Automatic manifest loading** with intelligent type detection and validation
  - **Enhanced base stage classes** with built-in configuration transformation
  - **Standardized CI/CD workflows** aligned with ecosystem patterns
  - **Improved type safety** with comprehensive TypeScript support
  - **Better developer experience** with automatic error handling and validation
  - **Consistent patterns** across all infrastructure repositories

  This release establishes @codeiqlabs/aws-cdk as the foundation for simplified, standardized CDK
  application development in the CodeIQLabs ecosystem.

## 1.1.1 - 2025-09-01

### Minor Changes

#### CDK Application Bootstrap Consolidation and CI/CD Alignment

This release introduces the comprehensive CDK Application Bootstrap Consolidation feature and aligns
CI/CD workflows with aws-utils patterns, delivering significant improvements to developer experience
and infrastructure automation.

#### CDK Application Bootstrap Consolidation

- **CdkApplication Class**: Automatic manifest loading, validation, and configuration with
  intelligent type detection
  - Eliminates 68-84% of manual bootstrap code in CDK applications
  - Automatic manifest loading from `src/manifest.yaml` with type detection
  - Built-in validation with context-aware error messages
  - Global aspects application (tagging) handled automatically
- **Enhanced Base Stage Classes**: ManagementBaseStage and WorkloadBaseStage with automatic
  configuration transformation
  - Automatic configuration transformation from manifest to stack configurations
  - Built-in validation for account-specific requirements
  - Environment-specific utilities for workload account management
  - Standardized stack creation with automatic naming and tagging
- **StageFactory Utilities**: Standardized stage creation with automatic naming and environment
  handling
  - Type-safe stage creation with proper environment configuration
  - Automatic dependency management for stack creation
  - Consistent naming patterns across all infrastructure
- **Application Bootstrap Module**: Complete application initialization utilities
  - Standardized patterns for configuration transformation
  - Type-safe interfaces with comprehensive error handling
  - Integration-ready utilities for CDK application bootstrap

#### CI/CD and Tooling Improvements

- **GitHub Actions Workflows**: Updated to match aws-utils patterns with push triggers and aligned
  job names
- **Dependency Management**: Updated to use proper versions instead of file references
  - @codeiqlabs/aws-utils: ^1.7.0 (was file:../codeiqlabs-aws-utils)
  - @codeiqlabs/eslint-prettier-config: ^1.6.0 (was file:../codeiqlabs-eslint-prettier-config)
- **Build Optimization**: Added optionalDependencies for Rollup platform packages to prevent CI
  build failures
- **Release Process**: Removed duplicate build steps and standardized release workflow
- **Documentation**: Standardized CHANGELOG.md format to match aws-utils structure

#### Benefits Summary

- **68-84% reduction** in CDK application bootstrap code
- **Automatic manifest loading** with intelligent type detection and validation
- **Enhanced base stage classes** with built-in configuration transformation
- **Standardized CI/CD workflows** aligned with ecosystem patterns
- **Improved type safety** with comprehensive TypeScript support
- **Better developer experience** with automatic error handling and validation
- **Consistent patterns** across all infrastructure repositories

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
