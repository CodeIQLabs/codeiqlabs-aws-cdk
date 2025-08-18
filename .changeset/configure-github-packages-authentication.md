---
'@codeiqlabs/aws-cdk': patch
---

fix: configure GitHub Packages authentication for CI/CD workflows

- Updated dependency reference from local file path to published GitHub Package Manager version ^1.4.1
- Added .npmrc configuration for GitHub Packages registry authentication
- Updated all GitHub Actions workflows (ci.yml, release.yml) to properly authenticate with GitHub Packages during npm install
- Added NODE_AUTH_TOKEN environment variable to all dependency installation steps
- Configured registry-url and scope for @codeiqlabs packages in workflow Node.js setup

This ensures CI/CD pipelines can successfully install the centralized eslint-prettier-config package from GitHub Packages rather than relying on local file references.
