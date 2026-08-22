/**
 * SES Email Forwarding type definitions
 */

import type { NamedConstructProps } from '../../core/constructs/named-construct';
import type { IHostedZone } from 'aws-cdk-lib/aws-route53';

/**
 * Email forwarding rule
 */
export interface EmailForwardingRule {
  /** Local part of the email address (e.g., "hello", "support", "*" for catch-all) */
  readonly from: string;
  /** Destination email address to forward to */
  readonly to: string;
}

/**
 * Properties for SesEmailForwardingConstruct
 */
export interface SesEmailForwardingConstructProps extends NamedConstructProps {
  /** Domain name to configure email forwarding for (e.g., "savvue.com") */
  readonly domainName: string;
  /** Route53 hosted zone for the domain (for MX, SPF, DMARC records) */
  readonly hostedZone: IHostedZone;
  /** Email forwarding rules */
  readonly forwardingRules: EmailForwardingRule[];
  /**
   * Extra TXT values merged into the apex SPF TXT record set (Route53 allows
   * only ONE record set per name+type, so a pre-existing apex TXT -- e.g. a
   * registrar-created zone carrying google-site-verification -- must be
   * deleted before deploy and its value carried HERE so CDK owns the merged
   * set and the verification never drifts away).
   */
  readonly additionalApexTxtValues?: string[];
  /** SES receipt rule set to add rules to (shared across domains) */
  readonly receiptRuleSet: import('aws-cdk-lib/aws-ses').ReceiptRuleSet;
  /** S3 bucket for temporary email storage */
  readonly emailBucket: import('aws-cdk-lib/aws-s3').IBucket;
  /** Rule set order priority (incremented per domain) */
  readonly rulePriority?: number;
}
