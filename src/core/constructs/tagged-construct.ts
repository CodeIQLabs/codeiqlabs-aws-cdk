/**
 * Tagged construct that automatically applies standardized tags
 *
 * This construct provides automatic tagging functionality for all AWS resources
 * without requiring inheritance from a base class.
 */

import { Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { ResourceNaming } from '@codeiqlabs/aws-utils';

/**
 * Properties for tagged constructs
 */
export interface TaggedConstructProps {
  /**
   * Resource naming utility for consistent naming
   */
  readonly naming: ResourceNaming;

  /**
   * Environment (nprd, prod, etc.)
   */
  readonly environment: string;

  /**
   * Company name for tagging
   */
  readonly company: string;

  /**
   * Project name for tagging
   */
  readonly project: string;

  /**
   * Owner for tagging and accountability
   */
  readonly owner?: string;

  /**
   * Additional custom tags
   */
  readonly customTags?: Record<string, string>;

  /**
   * Resource type for tagging (e.g., 's3-bucket', 'cloudfront-distribution')
   */
  readonly resourceType?: string;

  /**
   * Whether to apply cost allocation tags
   */
  readonly enableCostAllocation?: boolean;
}

/**
 * Construct that automatically applies standardized tags to all resources
 *
 * Provides:
 * - Standard organizational tags
 * - Environment-specific tags
 * - Cost allocation tags
 * - Resource-specific tags
 */
export class TaggedConstruct extends Construct {
  protected readonly naming: ResourceNaming;
  protected readonly environment: string;
  protected readonly company: string;
  protected readonly project: string;
  protected readonly owner?: string;
  protected readonly customTags: Record<string, string>;
  protected readonly resourceType?: string;
  protected readonly enableCostAllocation: boolean;

  constructor(scope: Construct, id: string, props: TaggedConstructProps) {
    super(scope, id);

    this.naming = props.naming;
    this.environment = props.environment;
    this.company = props.company;
    this.project = props.project;
    this.owner = props.owner;
    this.customTags = props.customTags || {};
    this.resourceType = props.resourceType;
    this.enableCostAllocation = props.enableCostAllocation ?? true;

    // Apply tags automatically
    this.applyStandardTags();
    this.applyEnvironmentTags();

    if (this.enableCostAllocation) {
      this.applyCostAllocationTags();
    }

    if (this.resourceType) {
      this.applyResourceSpecificTags();
    }
  }

  /**
   * Apply standard organizational tags
   */
  private applyStandardTags(): void {
    const tags: Record<string, string> = {
      Company: this.company,
      Project: this.project,
      Component: this.getComponentName(),
      Environment: this.environment,
      ManagedBy: 'CDK',
      ...this.customTags,
    };

    if (this.owner) {
      tags.Owner = this.owner;
    }

    Object.entries(tags).forEach(([key, value]) => {
      Tags.of(this).add(key, value);
    });
  }

  /**
   * Apply environment-specific tags
   */
  private applyEnvironmentTags(): void {
    const envTags: Record<string, string> = {
      EnvironmentType: this.isProduction() ? 'Production' : 'Non-Production',
    };

    if (this.isProduction()) {
      envTags.CriticalityLevel = 'High';
      envTags.BackupRequired = 'true';
    } else {
      envTags.CriticalityLevel = 'Medium';
      envTags.BackupRequired = 'false';
    }

    Object.entries(envTags).forEach(([key, value]) => {
      Tags.of(this).add(key, value);
    });
  }

  /**
   * Apply cost allocation tags
   */
  private applyCostAllocationTags(): void {
    const costTags = {
      CostCenter: this.project,
      BillingProject: this.project,
      BillingEnvironment: this.environment,
    };

    Object.entries(costTags).forEach(([key, value]) => {
      Tags.of(this).add(key, value);
    });
  }

  /**
   * Apply resource-specific tags
   */
  private applyResourceSpecificTags(): void {
    if (!this.resourceType) return;

    const resourceTags = {
      ResourceType: this.resourceType,
      Service: this.getServiceFromResourceType(this.resourceType),
    };

    Object.entries(resourceTags).forEach(([key, value]) => {
      Tags.of(this).add(key, value);
    });
  }

  /**
   * Extract AWS service name from resource type
   */
  private getServiceFromResourceType(resourceType: string): string {
    const serviceMap: Record<string, string> = {
      's3-bucket': 'S3',
      'cloudfront-distribution': 'CloudFront',
      'route53-hosted-zone': 'Route53',
      'acm-certificate': 'ACM',
      'organizations-ou': 'Organizations',
      'organizations-account': 'Organizations',
      'identity-center-permission-set': 'IdentityCenter',
    };

    return serviceMap[resourceType] || 'Unknown';
  }

  /**
   * Get component name for tagging
   */
  protected getComponentName(): string {
    return this.resourceType || 'unknown';
  }

  /**
   * Check if this is a production environment
   */
  protected isProduction(): boolean {
    return (
      this.environment.toLowerCase() === 'prod' || this.environment.toLowerCase() === 'production'
    );
  }

  /**
   * Check if this is a non-production environment
   */
  protected isNonProduction(): boolean {
    return !this.isProduction();
  }
}
