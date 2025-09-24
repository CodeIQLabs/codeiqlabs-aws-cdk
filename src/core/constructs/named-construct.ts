/**
 * Named construct that provides automatic naming conventions
 *
 * This construct extends TaggedConstruct to provide standardized
 * naming patterns for all AWS resources.
 */

import { TaggedConstruct, type TaggedConstructProps } from './tagged-construct';
import type { Construct } from 'constructs';

/**
 * Properties for named constructs
 */
export interface NamedConstructProps extends TaggedConstructProps {
  /**
   * Optional suffix for resource names
   */
  readonly nameSuffix?: string;

  /**
   * Whether to include environment in resource names
   */
  readonly includeEnvironmentInName?: boolean;
}

/**
 * Construct that provides standardized naming conventions
 *
 * Provides:
 * - Consistent resource naming patterns
 * - Environment-aware naming
 * - Export name generation
 * - SSM parameter name generation
 */
export class NamedConstruct extends TaggedConstruct {
  protected readonly nameSuffix?: string;
  protected readonly includeEnvironmentInName: boolean;

  constructor(scope: Construct, id: string, props: NamedConstructProps) {
    super(scope, id, props);

    this.nameSuffix = props.nameSuffix;
    this.includeEnvironmentInName = props.includeEnvironmentInName ?? true;
  }

  /**
   * Generate a resource name with optional suffix
   */
  protected generateResourceName(resourceType: string, suffix?: string): string {
    let name = resourceType;

    if (suffix) {
      name = `${name}-${suffix}`;
    }

    if (this.nameSuffix) {
      name = `${name}-${this.nameSuffix}`;
    }

    return this.naming.resourceName(name);
  }

  /**
   * Generate a unique resource name for resources that need global uniqueness
   */
  protected generateUniqueResourceName(resourceType: string, suffix?: string): string {
    const baseName = this.generateResourceName(resourceType, suffix);
    const timestamp = Date.now().toString(36);
    return `${baseName}-${timestamp}`;
  }

  /**
   * Generate an export name for CloudFormation exports
   */
  protected generateExportName(key: string): string {
    return this.naming.exportName(key);
  }

  /**
   * Generate an SSM parameter name
   */
  protected generateSsmParameterName(category: string, name: string): string {
    return this.naming.ssmParameterName(category, name);
  }

  /**
   * Generate a logical ID for CDK constructs
   */
  protected generateLogicalId(resourceType: string, suffix?: string): string {
    let id = this.toPascalCase(resourceType);

    if (suffix) {
      id = `${id}${this.toPascalCase(suffix)}`;
    }

    return id;
  }

  /**
   * Generate a description for resources
   */
  protected generateDescription(resourceType: string, purpose?: string): string {
    const basePurpose = purpose || `${resourceType} for ${this.project}`;
    return `${basePurpose} (${this.environment})`;
  }

  /**
   * Convert string to PascalCase for logical IDs
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Get a standardized name for the construct type
   */
  protected getConstructTypeName(): string {
    return this.constructor.name.replace(/Construct$/, '');
  }

  /**
   * Generate tags specific to naming
   */
  protected generateNamingTags(): Record<string, string> {
    return {
      ConstructType: this.getConstructTypeName(),
      NamingPattern: this.naming.getConfig().project,
    };
  }
}
