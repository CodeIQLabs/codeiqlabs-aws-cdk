/**
 * Convenience class for AWS resource tagging
 *
 * This module provides a convenient class-based interface for generating
 * and applying standardized tags across CodeIQLabs projects.
 */

import type { NamingConfig } from "@codeiqlabs/aws-utils/naming/types";
import type { TaggingOptions, CodeIQLabsStandardTags } from "./types";
import { generateStandardTags } from "./functions";

/**
 * Creates a tagging utility instance for a specific project and environment
 * This provides a convenient way to generate consistent tags across resources
 */
export class ResourceTagging {
  private config: NamingConfig;

  constructor(config: NamingConfig) {
    this.config = config;
  }

  /**
   * Generate standard tags for the configured project and environment
   * 
   * @param options - Tagging options including component name
   * @returns Standard tags object
   */
  standardTags(options: TaggingOptions = {}): CodeIQLabsStandardTags {
    return generateStandardTags(this.config, options);
  }

  /**
   * Generate tags for a specific component
   * This is a convenience method for the most common use case
   * 
   * @param component - Component name (e.g., 'VPC', 'Database', 'API')
   * @param extraOptions - Additional tagging options
   * @returns Standard tags object
   */
  componentTags(component: string, extraOptions: Omit<TaggingOptions, 'component'> = {}): CodeIQLabsStandardTags {
    return this.standardTags({ ...extraOptions, component });
  }

  /**
   * Get the current configuration
   * 
   * @returns Current naming configuration
   */
  getConfig(): NamingConfig {
    return { ...this.config };
  }

  /**
   * Create a new ResourceTagging instance with updated configuration
   * This is useful for creating variations without modifying the original instance
   * 
   * @param updates - Configuration updates to apply
   * @returns New ResourceTagging instance
   */
  withConfig(updates: Partial<NamingConfig>): ResourceTagging {
    return new ResourceTagging({ ...this.config, ...updates });
  }
}

/**
 * Create a ResourceTagging instance
 * This is a convenience factory function
 * 
 * @param project - Project name
 * @param environment - Environment name
 * @param region - Optional AWS region
 * @param accountId - Optional AWS account ID
 * @returns ResourceTagging instance
 */
export function createResourceTagging(
  project: string,
  environment: string,
  region?: string,
  accountId?: string
): ResourceTagging {
  return new ResourceTagging({
    project,
    environment,
    region,
    accountId
  });
}
