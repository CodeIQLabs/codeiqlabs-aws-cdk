/**
 * Route53 hosted zone and record constructs
 */

import { Duration } from 'aws-cdk-lib';
import {
  HostedZone,
  ARecord,
  AaaaRecord,
  CnameRecord,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import type { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { NamedConstruct, type NamedConstructProps } from '../../core/constructs/named-construct';
import type { Construct } from 'constructs';

/**
 * Properties for Route53 hosted zone constructs
 */
export interface Route53HostedZoneConstructProps extends NamedConstructProps {
  /**
   * Domain name for the hosted zone
   */
  readonly domainName: string;

  /**
   * Whether this is a subdomain delegation
   */
  readonly isSubdomain?: boolean;

  /**
   * Parent hosted zone ID (for subdomain delegation)
   */
  readonly parentHostedZoneId?: string;

  /**
   * Comment for the hosted zone
   */
  readonly comment?: string;
}

/**
 * Properties for Route53 record constructs
 */
export interface Route53RecordConstructProps extends NamedConstructProps {
  /**
   * Hosted zone for the record
   */
  readonly hostedZone: HostedZone;

  /**
   * Record name (subdomain)
   */
  readonly recordName?: string;

  /**
   * CloudFront distribution target
   */
  readonly cloudFrontDistribution?: IDistribution;

  /**
   * Custom target value
   */
  readonly targetValue?: string;

  /**
   * Record type
   */
  readonly recordType: 'A' | 'AAAA' | 'CNAME';

  /**
   * TTL for the record
   */
  readonly ttl?: Duration;
}

/**
 * Route53 hosted zone construct with built-in naming, tagging, and best practices
 */
export class Route53HostedZoneConstruct extends NamedConstruct {
  public readonly hostedZone: HostedZone;
  public readonly domainName: string;

  constructor(scope: Construct, id: string, props: Route53HostedZoneConstructProps) {
    super(scope, id, {
      ...props,
      resourceType: 'route53-hosted-zone',
      // Pass domain name through customTags so it's available in getComponentName()
      customTags: {
        ...props.customTags,
        DomainName: props.domainName,
      },
    });

    this.domainName = props.domainName;

    // Create hosted zone
    this.hostedZone = new HostedZone(this, this.generateLogicalId('hosted-zone'), {
      zoneName: props.domainName,
      comment:
        props.comment || this.generateDescription('hosted-zone', `DNS for ${props.domainName}`),
    });

    // Apply Route53-specific tags
    this.applyRoute53SpecificTags();
  }

  /**
   * Apply Route53-specific tags
   */
  private applyRoute53SpecificTags(): void {
    const route53Tags = {
      Service: 'Route53',
      DomainName: this.domainName,
      RecordType: 'HostedZone',
    };

    Object.entries(route53Tags).forEach(([key, value]) => {
      this.hostedZone.node.addMetadata(key, value);
    });
  }

  /**
   * Get the component name for tagging
   */
  protected getComponentName(): string {
    // Use domainName if available, otherwise fall back to customTags (set during construction)
    const domain = this.domainName || this.customTags?.['DomainName'] || 'unknown';
    return `route53-${domain.replace(/\./g, '-')}`;
  }

  /**
   * Get hosted zone ID
   */
  public getHostedZoneId(): string {
    return this.hostedZone.hostedZoneId;
  }

  /**
   * Get name servers
   */
  public getNameServers(): string[] {
    return this.hostedZone.hostedZoneNameServers || [];
  }
}

/**
 * Route53 record construct with built-in naming, tagging, and best practices
 */
export class Route53RecordConstruct extends NamedConstruct {
  public readonly record: ARecord | AaaaRecord | CnameRecord;
  public readonly recordType: string;

  constructor(scope: Construct, id: string, props: Route53RecordConstructProps) {
    super(scope, id, {
      ...props,
      resourceType: 'route53-record',
    });

    this.recordType = props.recordType;

    // Create the appropriate record type
    this.record = this.createRecord(props);

    // Apply Route53 record-specific tags
    this.applyRoute53RecordSpecificTags();
  }

  /**
   * Create the appropriate record type
   */
  private createRecord(props: Route53RecordConstructProps): ARecord | AaaaRecord | CnameRecord {
    const recordProps = {
      zone: props.hostedZone,
      recordName: props.recordName,
      ttl: props.ttl,
    };

    if (props.cloudFrontDistribution) {
      // CloudFront target
      const target = RecordTarget.fromAlias(new CloudFrontTarget(props.cloudFrontDistribution));

      switch (props.recordType) {
        case 'A':
          return new ARecord(this, this.generateLogicalId('a-record'), {
            ...recordProps,
            target,
          });
        case 'AAAA':
          return new AaaaRecord(this, this.generateLogicalId('aaaa-record'), {
            ...recordProps,
            target,
          });
        default:
          throw new Error(`CloudFront targets not supported for ${props.recordType} records`);
      }
    } else if (props.targetValue) {
      // Custom target value
      switch (props.recordType) {
        case 'CNAME':
          return new CnameRecord(this, this.generateLogicalId('cname-record'), {
            ...recordProps,
            domainName: props.targetValue,
          });
        default:
          throw new Error(
            `Custom target values not yet implemented for ${props.recordType} records`,
          );
      }
    } else {
      throw new Error('Either cloudFrontDistribution or targetValue must be provided');
    }
  }

  /**
   * Apply Route53 record-specific tags
   */
  private applyRoute53RecordSpecificTags(): void {
    const route53Tags = {
      Service: 'Route53',
      RecordType: this.recordType,
    };

    Object.entries(route53Tags).forEach(([key, value]) => {
      this.record.node.addMetadata(key, value);
    });
  }

  /**
   * Get the component name for tagging
   */
  protected getComponentName(): string {
    return `route53-record-${this.recordType.toLowerCase()}`;
  }
}
