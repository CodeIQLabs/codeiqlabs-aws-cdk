---
"@codeiqlabs/aws-cdk": patch
---

Align CI/CD workflows and tooling with aws-utils patterns

- Update GitHub Actions workflows to match aws-utils patterns (add push triggers, align job names)
- Update dependencies to use proper versions instead of file references
  - @codeiqlabs/aws-utils: ^1.6.0 (was file:../codeiqlabs-aws-utils)
  - @codeiqlabs/eslint-prettier-config: ^1.6.0 (was file:../codeiqlabs-eslint-prettier-config)
- Add optionalDependencies for Rollup platform packages to prevent CI build failures
- Remove duplicate build step in release.yml workflow
- Standardize CHANGELOG.md format to match aws-utils structure
- Ensure consistent CI/CD patterns across all CodeIQLabs repositories
