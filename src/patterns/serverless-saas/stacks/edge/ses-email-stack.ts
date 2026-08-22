/**
 * SES Email Forwarding Stack
 *
 * Deploys SES email forwarding infrastructure for domains with email configuration.
 * Must be deployed in us-east-1 (SES Email Receiving requirement).
 *
 * Creates shared resources (ReceiptRuleSet, S3 bucket) and per-domain constructs
 * for SES identity, DNS records, receipt rules, and forwarding Lambda functions.
 *
 * **Architecture:**
 * - Deployed in Management Account (us-east-1)
 * - One active ReceiptRuleSet shared across all domains
 * - One S3 bucket for temporary email storage (1 day lifecycle)
 * - Per-domain: SES identity, MX/SPF/DMARC records, Lambda forwarder, SMTP credentials
 */

import { Construct } from 'constructs';
import { Duration, Fn, RemovalPolicy } from 'aws-cdk-lib';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { BaseStack, type BaseStackProps } from '../../../../stacks/base/base-stack';
import { SesEmailForwardingConstruct } from '../../../../constructs/ses/constructs';
import type { EmailForwardingRule } from '../../../../constructs/ses/types';

/**
 * Domain email configuration for the stack
 */
export interface SesEmailDomainConfig {
  /** Domain name (e.g., "savvue.com") */
  domainName: string;
  /** Optional hosted zone ID (if not provided, imports via CloudFormation export) */
  hostedZoneId?: string;
  /** Email forwarding rules */
  forwardingRules: EmailForwardingRule[];
  /** Extra apex TXT values merged into the SPF record set (see construct prop) */
  additionalApexTxtValues?: string[];
}

export interface SesEmailForwardingStackProps extends BaseStackProps {
  /** Domains with email forwarding configuration */
  emailDomains: SesEmailDomainConfig[];
}

/**
 * SES Email Forwarding Stack
 *
 * Creates all SES email forwarding infrastructure:
 * - Shared ReceiptRuleSet (SES allows only one active per account)
 * - Shared S3 bucket for temporary email storage
 * - Per-domain SesEmailForwardingConstruct instances
 */
export class SesEmailForwardingStack extends BaseStack {
  constructor(scope: Construct, id: string, props: SesEmailForwardingStackProps) {
    super(scope, id, 'SesEmail', props);

    if (props.stackConfig.region !== 'us-east-1') {
      throw new Error(
        'SesEmailForwardingStack must be deployed in us-east-1 for SES Email Receiving',
      );
    }

    if (props.emailDomains.length === 0) {
      throw new Error('At least one email domain configuration is required');
    }

    const stackConfig = this.getStackConfig();

    // 1. Shared S3 bucket for temporary email storage
    const emailBucket = new s3.Bucket(this, 'EmailBucket', {
      bucketName: this.naming.resourceName('ses-email-incoming'),
      lifecycleRules: [
        {
          expiration: Duration.days(1),
          prefix: 'incoming/',
        },
      ],
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Grant SES permission to write to the bucket
    emailBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('ses.amazonaws.com')],
        actions: ['s3:PutObject'],
        resources: [emailBucket.arnForObjects('incoming/*')],
        conditions: {
          StringEquals: {
            'AWS:SourceAccount': stackConfig.accountId,
          },
        },
      }),
    );

    // 2. Shared ReceiptRuleSet (only one can be active per account)
    const receiptRuleSet = new ses.ReceiptRuleSet(this, 'ReceiptRuleSet', {
      receiptRuleSetName: this.naming.resourceName('ses-email-rules'),
    });

    // 3. Create per-domain email forwarding constructs
    let domainIndex = 0;
    for (const domainConfig of props.emailDomains) {
      // Import hosted zone (same pattern as AcmAndWafStack)
      const hostedZone = this.importHostedZone(domainConfig, domainIndex);

      new SesEmailForwardingConstruct(this, `EmailForwarding${domainIndex}`, {
        naming: this.naming,
        environment: stackConfig.environment,
        company: stackConfig.company,
        project: stackConfig.project,
        owner: stackConfig.owner,
        domainName: domainConfig.domainName,
        hostedZone,
        forwardingRules: domainConfig.forwardingRules,
        additionalApexTxtValues: domainConfig.additionalApexTxtValues,
        receiptRuleSet,
        emailBucket,
        rulePriority: domainIndex,
      });
      domainIndex++;
    }
  }

  /**
   * Import a hosted zone by ID or CloudFormation export
   */
  private importHostedZone(domain: SesEmailDomainConfig, index: number) {
    const sanitized = this.sanitizeDomainName(domain.domainName);
    const hostedZoneId =
      domain.hostedZoneId || Fn.importValue(this.naming.exportName(`${sanitized}-hosted-zone-id`));

    return HostedZone.fromHostedZoneAttributes(this, `HostedZone${index}`, {
      hostedZoneId,
      zoneName: domain.domainName,
    });
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
