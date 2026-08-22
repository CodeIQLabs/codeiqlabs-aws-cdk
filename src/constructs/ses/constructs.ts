/**
 * SES Email Forwarding Construct
 *
 * Creates SES email identity, DNS records (MX, SPF, DMARC),
 * receipt rules, and a forwarding Lambda for a single domain.
 *
 * Shared resources (ReceiptRuleSet, S3 bucket) are created at the stack level
 * and passed in as props to avoid SES's one-active-rule-set-per-account limit.
 */

import { Construct } from 'constructs';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { CfnOutput, Duration, SecretValue } from 'aws-cdk-lib';
import { NamedConstruct } from '../../core/constructs/named-construct';
import type { SesEmailForwardingConstructProps } from './types';

/**
 * SES Email Forwarding Construct
 *
 * Per-domain construct that creates:
 * - SES EmailIdentity with DKIM verification
 * - MX record pointing to SES inbound SMTP
 * - SPF TXT record on root domain
 * - DMARC TXT record on _dmarc subdomain
 * - SES ReceiptRule (S3 → Lambda forwarding)
 * - Lambda function for email forwarding
 * - IAM user + access key for SMTP sending (Gmail "Send mail as")
 * - Secrets Manager secret with SMTP credentials
 */
export class SesEmailForwardingConstruct extends NamedConstruct {
  /** The SES email identity for this domain */
  public readonly emailIdentity: ses.EmailIdentity;
  /** The forwarding Lambda function */
  public readonly forwardingFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: SesEmailForwardingConstructProps) {
    super(scope, id, {
      ...props,
      resourceType: 'ses-email-forwarding',
    });

    const {
      domainName,
      hostedZone,
      forwardingRules,
      receiptRuleSet,
      emailBucket,
      additionalApexTxtValues,
    } = props;
    const sanitizedDomain = this.sanitizeDomainName(domainName);

    // 1. SES Email Identity (verifies domain, auto-creates DKIM CNAMEs via Route53)
    this.emailIdentity = new ses.EmailIdentity(this, this.generateLogicalId('identity'), {
      identity: ses.Identity.publicHostedZone(hostedZone),
    });

    // 2. MX Record — route inbound email to SES
    new route53.MxRecord(this, this.generateLogicalId('mx-record'), {
      zone: hostedZone,
      values: [
        {
          priority: 10,
          hostName: 'inbound-smtp.us-east-1.amazonaws.com',
        },
      ],
      ttl: Duration.hours(1),
    });

    // 3. SPF TXT Record — authorize SES to send on behalf of this domain
    new route53.TxtRecord(this, this.generateLogicalId('spf-record'), {
      zone: hostedZone,
      values: ['v=spf1 include:amazonses.com ~all', ...(additionalApexTxtValues ?? [])],
      ttl: Duration.hours(1),
    });

    // 4. DMARC TXT Record — email authentication policy
    new route53.TxtRecord(this, this.generateLogicalId('dmarc-record'), {
      zone: hostedZone,
      recordName: `_dmarc.${domainName}`,
      values: [`v=DMARC1; p=none; rua=mailto:admin@${domainName}`],
      ttl: Duration.hours(1),
    });

    // 5. Build forwarding map from rules
    const forwardingMap: Record<string, string> = {};
    for (const rule of forwardingRules) {
      forwardingMap[rule.from] = rule.to;
    }

    // 6. Forwarding Lambda
    this.forwardingFunction = new lambda.Function(
      this,
      this.generateLogicalId('forwarding-lambda'),
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline(this.getForwardingLambdaCode()),
        timeout: Duration.seconds(30),
        memorySize: 256,
        environment: {
          FORWARDING_MAP: JSON.stringify(forwardingMap),
          EMAIL_BUCKET: emailBucket.bucketName,
          DOMAIN: domainName,
        },
        description: `Email forwarding for ${domainName}`,
      },
    );

    // Grant Lambda permissions to read from S3 and send via SES
    emailBucket.grantRead(this.forwardingFunction);
    this.forwardingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendRawEmail'],
        resources: ['*'],
      }),
    );

    // 7. SES Receipt Rule — S3 action → Lambda action
    new ses.ReceiptRule(this, this.generateLogicalId('receipt-rule'), {
      ruleSet: receiptRuleSet,
      receiptRuleName: `forward-${domainName.replace(/\./g, '-')}`,
      recipients: [domainName],
      actions: [
        new sesActions.S3({
          bucket: emailBucket,
          objectKeyPrefix: `incoming/${domainName}/`,
        }),
        new sesActions.Lambda({
          function: this.forwardingFunction,
          invocationType: sesActions.LambdaInvocationType.EVENT,
        }),
      ],
      enabled: true,
    });

    // 8. IAM User + Access Key for SMTP sending (Gmail "Send mail as")
    const smtpUser = new iam.User(this, this.generateLogicalId('smtp-user'), {
      userName: `ses-smtp-${domainName.replace(/\./g, '-')}`,
    });

    smtpUser.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendRawEmail'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'ses:FromAddress': forwardingRules.map((r) => `${r.from}@${domainName}`),
          },
        },
      }),
    );

    const accessKey = new iam.AccessKey(this, this.generateLogicalId('smtp-access-key'), {
      user: smtpUser,
    });

    // 9. Store SMTP credentials in Secrets Manager
    new secretsmanager.Secret(this, this.generateLogicalId('smtp-secret'), {
      secretName: `ses-smtp/${domainName}`,
      description: `SES SMTP credentials for ${domainName} (use for Gmail "Send mail as")`,
      secretObjectValue: {
        host: SecretValue.unsafePlainText('email-smtp.us-east-1.amazonaws.com'),
        port: SecretValue.unsafePlainText('587'),
        username: SecretValue.resourceAttribute(accessKey.accessKeyId),
        password: accessKey.secretAccessKey,
      },
    });

    // Output SMTP info for easy reference
    new CfnOutput(this, `${sanitizedDomain}SmtpHost`, {
      value: 'email-smtp.us-east-1.amazonaws.com',
      description: `SMTP host for ${domainName}`,
    });

    new CfnOutput(this, `${sanitizedDomain}SmtpSecretArn`, {
      value: `ses-smtp/${domainName}`,
      description: `Secrets Manager secret name with SMTP credentials for ${domainName}`,
    });
  }

  protected getComponentName(): string {
    return 'ses-email-forwarding';
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }

  /**
   * Inline Lambda code for email forwarding.
   * Receives SES event, fetches raw email from S3, looks up destination
   * from FORWARDING_MAP env var, replaces Return-Path to prevent bounce loops,
   * and forwards via SES SendRawEmail.
   */
  private getForwardingLambdaCode(): string {
    return `
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses");

const s3 = new S3Client();
const ses = new SESClient();

exports.handler = async (event) => {
  const record = event.Records[0];
  const sesEvent = record.ses;
  const messageId = sesEvent.mail.messageId;
  const recipients = sesEvent.receipt.recipients;
  const domain = process.env.DOMAIN;
  const forwardingMap = JSON.parse(process.env.FORWARDING_MAP);
  const bucket = process.env.EMAIL_BUCKET;

  // Determine forwarding destination
  let destination = null;
  for (const recipient of recipients) {
    const localPart = recipient.split("@")[0].toLowerCase();
    destination = forwardingMap[localPart] || forwardingMap["*"];
    if (destination) break;
  }

  if (!destination) {
    console.log("No forwarding rule matched for:", recipients);
    return { status: "no_match" };
  }

  // Fetch raw email from S3
  const key = "incoming/" + domain + "/" + messageId;
  const s3Response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  let rawEmail = await s3Response.Body.transformToString();

  // Extract original From for reply-to
  const fromMatch = rawEmail.match(/^From:\\s*(.+)$/mi);
  const originalFrom = fromMatch ? fromMatch[1].trim() : "";

  // Replace Return-Path to prevent bounce loops
  rawEmail = rawEmail.replace(
    /^Return-Path:.*$/mi,
    "Return-Path: <admin@" + domain + ">"
  );

  // Rewrite From header to domain admin (required for SES sandbox + better DKIM/SPF alignment)
  // Preserve original sender in Reply-To so replies go back to them
  rawEmail = rawEmail.replace(
    /^From:.*$/mi,
    "From: admin@" + domain + "\\nReply-To: " + originalFrom + "\\nX-Original-From: " + originalFrom
  );

  // Add X-Forwarded-To header before To:
  rawEmail = rawEmail.replace(
    /^(To:.*$)/mi,
    "X-Forwarded-To: " + destination + "\\n$1"
  );

  // Strip DKIM-Signature headers to prevent "Duplicate header" errors
  // SES adds its own DKIM signature when sending; originals from external senders conflict
  // Must consume trailing newline to avoid blank lines that break header/body boundary
  rawEmail = rawEmail.replace(/^DKIM-Signature:.*(?:\\r?\\n[ \\t]+.*)*\\r?\\n/gmi, "");

  // Send forwarded email
  await ses.send(new SendRawEmailCommand({
    Source: "admin@" + domain,
    Destinations: [destination],
    RawMessage: { Data: Buffer.from(rawEmail) },
  }));

  console.log("Forwarded email", messageId, "to", destination);
  return { status: "forwarded", destination };
};
`.trim();
  }
}
