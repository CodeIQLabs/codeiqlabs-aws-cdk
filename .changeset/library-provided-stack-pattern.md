---
'@codeiqlabs/aws-cdk': minor
---

**Library-Provided Stack Pattern Implementation**

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
