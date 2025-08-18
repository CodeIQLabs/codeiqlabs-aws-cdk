---
'@codeiqlabs/aws-cdk': patch
---

fix: use custom GH_TOKEN for GitHub Packages authentication

- Replaced GITHUB_TOKEN with GH_TOKEN secret for all npm package installations
- The automatic GITHUB_TOKEN has limited permissions and cannot read packages from other
  repositories
- GH_TOKEN is a custom Personal Access Token with proper read:packages permission
- Updated all workflow jobs (CI and release) to use the custom token
- This resolves the persistent 403 Forbidden errors when accessing
  @codeiqlabs/eslint-prettier-config

The custom GH_TOKEN secret has the necessary permissions: read:packages, write:packages,
delete:packages, and repo access.
