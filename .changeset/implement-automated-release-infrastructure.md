---
'@codeiqlabs/aws-cdk': minor
---

feat: implement automated release infrastructure with dual module publishing

- Added @changesets/cli for automated version management and release notes
- Implemented dual ESM/CJS publishing with conditional exports for maximum compatibility
- Added comprehensive GitHub Actions CI/CD workflows for pull request validation and automated releases
- Integrated Husky pre-commit hooks with lint-staged for automatic code quality enforcement
- Added comprehensive test suite validating both ESM and CJS module loading
- Updated package.json with changeset-related scripts and enhanced build process
- Added TypeScript configurations for dual builds (tsconfig.esm.json, tsconfig.cjs.json)
- Enhanced documentation with contributing guidelines and release process documentation
- Configured publishing to GitHub Packages with proper authentication and permissions

This establishes the same sophisticated centralized code quality infrastructure used in the eslint-prettier-config repository, ensuring consistent development workflows and automated quality enforcement across all CodeIQLabs packages.
