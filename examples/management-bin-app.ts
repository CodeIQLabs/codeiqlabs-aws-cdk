#!/usr/bin/env node

/**
 * CodeIQLabs Management Account CDK Application
 *
 * This is the new simplified approach using auto-detection.
 * The application automatically:
 * 1. Loads src/manifest.yaml
 * 2. Detects it's a management account manifest
 * 3. Creates StandardManagementStage with all infrastructure
 * 4. Deploys Organizations, Identity Center, and Domain Delegation
 *
 * No configuration needed - everything is driven by manifest.yaml!
 */

import { createManagementApp } from '@codeiqlabs/aws-cdk';

// That's it! This is all you need for a management account.
// The library automatically:
// - Loads and validates your manifest.yaml
// - Creates StandardManagementStage
// - Configures Organizations, Identity Center, Domain Delegation
// - Applies proper naming, tagging, and dependencies

createManagementApp()
  .then((app) => app.synth())
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to create management application:', error.message);
    process.exit(1);
  });

/**
 * Alternative: Use the universal auto-detection approach
 *
 * This works for any manifest type and automatically detects
 * whether to create management or workload infrastructure:
 *
 * ```typescript
 * import { createAutoApp } from '@codeiqlabs/aws-cdk';
 *
 * createAutoApp()
 *   .then(app => app.synth())
 *   .catch(error => {
 *     console.error('❌ Application failed:', error.message);
 *     process.exit(1);
 *   });
 * ```
 */
