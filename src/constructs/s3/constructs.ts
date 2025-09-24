/**
 * S3 bucket constructs with naming/tagging
 */

import { RemovalPolicy } from 'aws-cdk-lib';
import {
  Bucket,
  BucketEncryption,
  BlockPublicAccess,
  BucketAccessControl,
} from 'aws-cdk-lib/aws-s3';
import { NamedConstruct, type NamedConstructProps } from '../../core/constructs/named-construct';
import type { Construct } from 'constructs';

/**
 * Properties for S3 bucket constructs
 */
export interface S3BucketConstructProps extends NamedConstructProps {
  /**
   * Type of S3 bucket (static-hosting, data, logs, etc.)
   */
  readonly bucketType: string;

  /**
   * Whether to enable versioning
   */
  readonly versioning?: boolean;

  /**
   * Whether to enable public read access (for static hosting)
   */
  readonly publicReadAccess?: boolean;

  /**
   * Encryption type
   */
  readonly encryption?: BucketEncryption;

  /**
   * Removal policy
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * S3 bucket construct with built-in naming, tagging, and best practices
 */
export class S3BucketConstruct extends NamedConstruct {
  public readonly bucket: Bucket;
  public readonly bucketType: string;
  private readonly versioningEnabled: boolean;

  constructor(scope: Construct, id: string, props: S3BucketConstructProps) {
    super(scope, id, {
      ...props,
      resourceType: 's3-bucket',
    });

    this.bucketType = props.bucketType;
    this.versioningEnabled = props.versioning ?? false;

    // Create S3 bucket with standardized configuration
    this.bucket = new Bucket(this, this.generateLogicalId('bucket'), {
      bucketName: this.generateResourceName('bucket', props.bucketType),

      // Security configurations
      encryption: props.encryption || BucketEncryption.S3_MANAGED,
      blockPublicAccess: props.publicReadAccess
        ? BlockPublicAccess.BLOCK_ACLS
        : BlockPublicAccess.BLOCK_ALL,

      // Versioning
      versioned: this.versioningEnabled,

      // Access control
      accessControl: props.publicReadAccess
        ? BucketAccessControl.BUCKET_OWNER_FULL_CONTROL
        : BucketAccessControl.PRIVATE,

      // Lifecycle
      removalPolicy:
        props.removalPolicy || (this.isProduction() ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY),

      // Auto delete objects for non-production
      autoDeleteObjects: this.isNonProduction(),
    });

    // Apply additional tags specific to S3
    this.applyS3SpecificTags();
  }

  /**
   * Apply S3-specific tags
   */
  private applyS3SpecificTags(): void {
    const s3Tags = {
      Service: 'S3',
      BucketType: this.bucketType,
      Encryption: 'Enabled',
      Versioning: this.versioningEnabled ? 'Enabled' : 'Disabled',
    };

    Object.entries(s3Tags).forEach(([key, value]) => {
      this.bucket.node.addMetadata(key, value);
    });
  }

  /**
   * Get the component name for tagging
   */
  protected getComponentName(): string {
    return `s3-${this.bucketType}`;
  }

  /**
   * Get bucket ARN
   */
  public getBucketArn(): string {
    return this.bucket.bucketArn;
  }

  /**
   * Get bucket name
   */
  public getBucketName(): string {
    return this.bucket.bucketName;
  }

  /**
   * Get bucket domain name
   */
  public getBucketDomainName(): string {
    return this.bucket.bucketDomainName;
  }

  /**
   * Get bucket regional domain name
   */
  public getBucketRegionalDomainName(): string {
    return this.bucket.bucketRegionalDomainName;
  }
}
