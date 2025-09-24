#!/usr/bin/env node

/**
 * Universal CodeIQLabs CDK Application
 *
 * This is the ultimate simplified approach - works for ANY manifest type!
 * The application automatically:
 * 1. Loads src/manifest.yaml
 * 2. Auto-detects the manifest type (management vs workload)
 * 3. Creates the appropriate infrastructure automatically
 * 4. Deploys everything based on manifest configuration
 *
 * This single file works for:
 * - Management accounts (Organizations, Identity Center, Domains)
 * - Workload accounts (Websites, Applications, VPCs)
 * - Any future manifest types we add
 */

import { createAutoApp } from '@codeiqlabs/aws-cdk';

// This is literally ALL you need for ANY CodeIQLabs infrastructure!
// The library automatically detects your manifest type and creates
// the appropriate infrastructure with zero configuration.

createAutoApp()
  .then((app) => {
    // eslint-disable-next-line no-console
    console.log(`✅ Successfully created ${app.manifestType} infrastructure`);
    app.synth();
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to create application:', error.message);

    // Provide helpful error messages
    if (error.message.includes('manifest')) {
      // eslint-disable-next-line no-console
      console.error('💡 Make sure src/manifest.yaml exists and is valid');
    } else if (error.message.includes('type')) {
      // eslint-disable-next-line no-console
      console.error('💡 Supported manifest types: management, workload');
    }

    process.exit(1);
  });

/**
 * What this replaces:
 *
 * OLD WAY (manual configuration):
 * ```typescript
 * const app = await CdkApplication.create({ expectedType: 'management' });
 * app.createManagementStage(ManagementStage);
 * app.synth();
 * ```
 *
 * NEW WAY (auto-detection):
 * ```typescript
 * createAutoApp().then(app => app.synth());
 * ```
 *
 * The new way:
 * ✅ Works for any manifest type
 * ✅ Zero configuration required
 * ✅ Automatic type detection
 * ✅ Best practices included
 * ✅ Proper error handling
 * ✅ Future-proof for new manifest types
 */
