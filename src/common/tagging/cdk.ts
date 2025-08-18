/**
 * CDK-specific tagging utilities for AWS projects
 *
 * This module provides CDK-specific tag application functions that require aws-cdk-lib
 * to be available in the consuming project. Core tagging logic is imported from
 * @codeiqlabs/aws-utils to maintain consistency and avoid duplication.
 */

import type { Construct } from 'constructs';
import type { Tags as CdkTags } from 'aws-cdk-lib';
import type {
  NamingConfig,
  TaggingOptions,
  ExtraTags,
  ResourceNaming,
} from '@codeiqlabs/aws-utils';
import { generateStandardTags, convertToCfnTags } from '@codeiqlabs/aws-utils';

// Dynamic import for CDK Tags to avoid requiring aws-cdk-lib at module level
let Tags: typeof CdkTags;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Tags = require('aws-cdk-lib').Tags;
} catch {
  // CDK not available - functions will throw runtime errors if called
  Tags = null as any;
}

// ============================================================================
// CDK-SPECIFIC TAG APPLICATION
// ============================================================================

/**
 * Safely add a tag to a CDK construct with validation
 *
 * @param cdkTags - CDK Tags class
 * @param construct - CDK construct to tag
 * @param key - Tag key
 * @param value - Tag value
 */
export function safeAddTag(
  cdkTags: typeof CdkTags,
  construct: Construct,
  key: string,
  value: unknown,
): void {
  // Basic validation - ensure key and value are strings and not empty
  if (typeof key !== 'string' || key.trim() === '') {
    console.warn(`Invalid tag key: ${key}. Skipping tag.`);
    return;
  }

  const stringValue = String(value);
  if (stringValue.trim() === '') {
    console.warn(`Invalid tag value for key "${key}": ${value}. Skipping tag.`);
    return;
  }

  cdkTags.of(construct).add(key.trim(), stringValue.trim());
}

/**
 * Apply standardized tags to a CDK construct
 * This is the main function for applying enterprise standard tags to CDK resources
 *
 * @param construct - CDK construct to tag
 * @param config - Naming configuration
 * @param options - Tagging options including component name, owner, and company
 * @param extraTags - Additional custom tags to apply
 */
export function applyStandardTags(
  construct: Construct,
  config: NamingConfig,
  options: TaggingOptions & { component: string; owner: string; company: string },
  extraTags?: ExtraTags,
): void {
  // Use the dynamically imported Tags
  if (!Tags) {
    throw new Error(
      'aws-cdk-lib is not available. Please install aws-cdk-lib to use CDK tagging functions.',
    );
  }

  // Generate standard tags
  const standardTags = generateStandardTags(config, options);

  // Apply standard tags with validation
  Object.entries(standardTags).forEach(([key, value]) => {
    safeAddTag(Tags, construct, key, value);
  });

  // Apply extra tags if provided with validation
  if (extraTags) {
    Object.entries(extraTags).forEach(([key, value]) => {
      safeAddTag(Tags, construct, key, value);
    });
  }
}

/**
 * Apply standardized tags using ResourceNaming instance
 * This is a convenience function for projects already using ResourceNaming
 *
 * @param construct - CDK construct to tag
 * @param naming - ResourceNaming instance
 * @param options - Tagging options including component name, owner, and company
 * @param extraTags - Additional custom tags to apply
 */
export function applyStandardTagsWithNaming(
  construct: Construct,
  naming: ResourceNaming,
  options: TaggingOptions & { component: string; owner: string; company: string },
  extraTags?: ExtraTags,
): void {
  // Use the dynamically imported Tags
  if (!Tags) {
    throw new Error(
      'aws-cdk-lib is not available. Please install aws-cdk-lib to use CDK tagging functions.',
    );
  }

  // Generate tags using the naming instance's config
  const standardTags = generateStandardTags(naming.getConfig(), options);

  // Apply standard tags with validation
  Object.entries(standardTags).forEach(([key, value]) => {
    safeAddTag(Tags, construct, key, value);
  });

  // Apply extra tags if provided with validation
  if (extraTags) {
    Object.entries(extraTags).forEach(([key, value]) => {
      safeAddTag(Tags, construct, key, value);
    });
  }
}

/**
 * Generate standard tags and convert to CloudFormation tag format
 *
 * This is a convenience function that combines tag generation and CFN conversion
 * for use with CloudFormation resources that require the CFN tag format.
 *
 * @param naming - ResourceNaming instance for tag generation
 * @param options - Additional tagging options
 * @returns Array of CloudFormation tag objects
 */
export function applyStandardCfnTags(
  naming: ResourceNaming,
  options?: TaggingOptions,
): Array<{ key: string; value: string }> {
  const tags = generateStandardTags(naming.getConfig(), options);
  return convertToCfnTags(tags);
}

// convertToCfnTags is exported from ./functions to avoid duplication
