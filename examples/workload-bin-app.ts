#!/usr/bin/env node

/**
 * CodeIQLabs Workload Account CDK Application
 *
 * This is the new simplified approach using auto-detection.
 * The application automatically:
 * 1. Loads src/manifest.yaml
 * 2. Detects it's a workload account manifest
 * 3. Creates WorkloadBaseStage for each environment
 * 4. Deploys appropriate infrastructure (VPC, website, etc.)
 *
 * No configuration needed - everything is driven by manifest.yaml!
 */

import { createWorkloadApp } from '@codeiqlabs/aws-cdk';

// That's it! This is all you need for a workload account.
// The library automatically:
// - Loads and validates your manifest.yaml
// - Creates WorkloadBaseStage for each environment (nprd, prod, etc.)
// - Configures domain delegation, certificates, hosting
// - Applies proper naming, tagging, and cross-account integration

createWorkloadApp()
  .then((app) => app.synth())
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to create workload application:', error.message);
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
