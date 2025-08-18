---
'@codeiqlabs/aws-cdk': patch
---

fix: update eslint-prettier-config to v1.5.0 with modular architecture

- Updated @codeiqlabs/eslint-prettier-config dependency from ^1.4.1 to ^1.5.0
- Resolves ESLint 9.x compatibility issues with React plugin dependencies
- Benefits from new modular configuration architecture with proper separation of concerns
- Minimal configuration now has zero React dependencies, eliminating dependency conflicts
- Enhanced TypeScript rules and better error handling for missing dependencies

This resolves the ERESOLVE dependency conflicts that were preventing npm ci from succeeding.
