/**
 * Generic Secrets Stack for Workload Infrastructure
 *
 * Creates AWS Secrets Manager secrets based on manifest configuration.
 * Secrets are organized by environment and can be referenced by ECS task definitions.
 *
 * Secret naming convention: {project}/{env}/{key}
 * Per-brand secrets: {project}/{env}/{key}/{brand}
 *
 * @example
 * ```typescript
 * new SaasSecretsStack(app, 'Secrets', {
 *   stackConfig: {
 *     project: 'my-app',
 *     environment: 'nprd',
 *     region: 'us-east-1',
 *     accountId: '466279485605',
 *     owner: 'MyCompany',
 *     company: 'MyCompany',
 *   },
 *   secretsConfig: {
 *     recoveryWindowInDays: 7,
 *     brands: ['brand1', 'brand2'],
 *     items: [
 *       { key: 'database-url', description: 'PostgreSQL connection string' },
 *       { key: 'api-key', generated: true, length: 64 },
 *       { key: 'oauth', perBrand: true, jsonFields: ['clientId', 'clientSecret'] },
 *     ],
 *   },
 * });
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * Configuration for a single secret item
 */
export interface SecretItemConfig {
  /**
   * Secret key - used in the secret name: {project}/{env}/{key}
   */
  key: string;

  /**
   * Human-readable description of the secret
   */
  description?: string;

  /**
   * If true, auto-generate a random secret value
   * @default false
   */
  generated?: boolean;

  /**
   * Length of generated secret (only used when generated: true)
   * @default 32
   */
  length?: number;

  /**
   * If true, create one secret per brand: {project}/{env}/{key}/{brand}
   * Requires brands array to be defined in SaasSecretsConfig
   * @default false
   */
  perBrand?: boolean;

  /**
   * If provided, creates a JSON secret with these fields as keys
   * Each field gets a placeholder value
   */
  jsonFields?: string[];
}

/**
 * Configuration for secrets stack
 */
export interface SaasSecretsConfig {
  /**
   * Secret retention period in days when deleted
   * @default 7
   */
  recoveryWindowInDays?: number;

  /**
   * List of brands for per-brand secrets
   * Used when a secret item has perBrand: true
   */
  brands?: string[];

  /**
   * Secret items to create
   */
  items?: SecretItemConfig[];
}

/**
 * Props for SaasSecretsStack
 */
export interface SaasSecretsStackProps extends BaseStackProps {
  /**
   * Secrets configuration
   */
  secretsConfig: SaasSecretsConfig;
}

/**
 * Generic Secrets Stack for workload infrastructure
 *
 * Creates Secrets Manager secrets based on manifest configuration.
 * Secrets are created with placeholder values that must be updated manually or via CLI.
 *
 * After deployment, update secrets using AWS CLI:
 * ```bash
 * aws secretsmanager put-secret-value \
 *   --secret-id my-app/nprd/database-url \
 *   --secret-string "postgresql://user:pass@host:5432/db"
 * ```
 */
export class SaasSecretsStack extends BaseStack {
  /**
   * Map of secret key to secret (for simple secrets)
   */
  public readonly secrets: Map<string, secretsmanager.ISecret> = new Map();

  /**
   * Map of secret key to brand to secret (for per-brand secrets)
   */
  public readonly perBrandSecrets: Map<string, Map<string, secretsmanager.ISecret>> = new Map();

  /**
   * IAM policy that grants read access to all secrets
   */
  public readonly secretsReadPolicy: iam.ManagedPolicy;

  constructor(scope: Construct, id: string, props: SaasSecretsStackProps) {
    super(scope, id, 'Secrets', props);

    const config = props.secretsConfig;
    const env = this.getStackConfig().environment;
    const project = this.getStackConfig().project.toLowerCase();
    const brands = config.brands ?? [];
    const items = config.items ?? [];

    // Secret naming prefix: {project}/{env}
    const secretPrefix = `${project}/${env}`;

    // Track all secret ARNs for IAM policy
    const allSecretArns: string[] = [];

    // Process each secret item from config
    for (const item of items) {
      if (item.perBrand) {
        // Create per-brand secrets
        if (brands.length === 0) {
          throw new Error(
            `Secret "${item.key}" has perBrand: true but no brands are defined in secrets.brands`,
          );
        }

        const brandSecrets = new Map<string, secretsmanager.ISecret>();

        for (const brand of brands) {
          const secret = this.createSecret(
            `${this.toPascalCase(item.key)}${this.toPascalCase(brand)}Secret`,
            `${secretPrefix}/${item.key}/${brand}`,
            item.description
              ? `${item.description} for ${brand} in ${env}`
              : `${item.key} for ${brand} in ${env}`,
            item,
          );

          brandSecrets.set(brand, secret);
          allSecretArns.push(secret.secretArn);

          // Export per-brand secret ARN
          new cdk.CfnOutput(this, `${this.toPascalCase(item.key)}${this.toPascalCase(brand)}Arn`, {
            value: secret.secretArn,
            exportName: this.naming.exportName(`${item.key}-${brand}-secret-arn`),
            description: `${item.key} Secret ARN for ${brand}`,
          });
        }

        this.perBrandSecrets.set(item.key, brandSecrets);
      } else {
        // Create simple secret
        const secret = this.createSecret(
          `${this.toPascalCase(item.key)}Secret`,
          `${secretPrefix}/${item.key}`,
          item.description
            ? `${item.description} for ${env}`
            : `${item.key} for ${env} environment`,
          item,
        );

        this.secrets.set(item.key, secret);
        allSecretArns.push(secret.secretArn);

        // Export secret ARN
        new cdk.CfnOutput(this, `${this.toPascalCase(item.key)}SecretArn`, {
          value: secret.secretArn,
          exportName: this.naming.exportName(`${item.key}-secret-arn`),
          description: `${item.key} Secret ARN`,
        });
      }
    }

    // Create IAM managed policy for reading all secrets
    this.secretsReadPolicy = new iam.ManagedPolicy(this, 'SecretsReadPolicy', {
      managedPolicyName: this.naming.resourceName('secrets-read-policy'),
      description: `Allows reading secrets for ${env} environment`,
      statements:
        allSecretArns.length > 0
          ? [
              new iam.PolicyStatement({
                sid: 'AllowSecretsManagerRead',
                effect: iam.Effect.ALLOW,
                actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
                resources: allSecretArns,
              }),
            ]
          : [],
    });

    // Export policy ARN
    new cdk.CfnOutput(this, 'SecretsReadPolicyArn', {
      value: this.secretsReadPolicy.managedPolicyArn,
      exportName: this.naming.exportName('secrets-read-policy-arn'),
      description: 'Secrets Read Policy ARN',
    });
  }

  /**
   * Create a secret based on item configuration
   *
   * Note: RecoveryWindowInDays is only valid for secrets with GenerateSecretString.
   * For secrets with SecretString/SecretObjectValue, the recovery window is controlled
   * at deletion time via the AWS CLI or console.
   */
  private createSecret(
    constructId: string,
    secretName: string,
    description: string,
    item: SecretItemConfig,
  ): secretsmanager.Secret {
    if (item.generated) {
      // Auto-generate secret value
      return new secretsmanager.Secret(this, constructId, {
        secretName,
        description,
        generateSecretString: {
          excludePunctuation: true,
          passwordLength: item.length ?? 32,
        },
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
    } else if (item.jsonFields && item.jsonFields.length > 0) {
      // Create JSON secret with placeholder fields
      const secretObjectValue: Record<string, cdk.SecretValue> = {};
      for (const field of item.jsonFields) {
        secretObjectValue[field] = cdk.SecretValue.unsafePlainText('PLACEHOLDER_UPDATE_ME');
      }

      return new secretsmanager.Secret(this, constructId, {
        secretName,
        description,
        secretObjectValue,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
    } else {
      // Create simple string secret with placeholder
      return new secretsmanager.Secret(this, constructId, {
        secretName,
        description,
        secretStringValue: cdk.SecretValue.unsafePlainText('PLACEHOLDER_UPDATE_ME'),
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
    }
  }

  /**
   * Convert kebab-case or snake_case to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Get a secret by key
   */
  public getSecret(key: string): secretsmanager.ISecret | undefined {
    return this.secrets.get(key);
  }

  /**
   * Get a per-brand secret by key and brand
   */
  public getPerBrandSecret(key: string, brand: string): secretsmanager.ISecret | undefined {
    return this.perBrandSecrets.get(key)?.get(brand);
  }

  /**
   * Get all secret ARNs as an array (useful for IAM policies)
   */
  public getAllSecretArns(): string[] {
    const arns: string[] = [];

    for (const secret of this.secrets.values()) {
      arns.push(secret.secretArn);
    }

    for (const brandSecrets of this.perBrandSecrets.values()) {
      for (const secret of brandSecrets.values()) {
        arns.push(secret.secretArn);
      }
    }

    return arns;
  }
}
