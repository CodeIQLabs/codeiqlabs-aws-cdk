/**
 * ECR Repository Stack for Workload Infrastructure
 *
 * Creates ECR repositories for webapp and API services.
 * Repositories are created separately from ECS services to ensure they persist
 * even if service deployment fails.
 *
 * @example
 * ```typescript
 * new EcrRepositoryStack(app, 'ECR', {
 *   stackConfig: { ... },
 *   repositoryConfig: {
 *     webappBrands: ['savvue', 'timisly', 'equitrio'],
 *     apiBrands: ['savvue', 'equitrio'],
 *   },
 * });
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * ECR Repository configuration
 */
export interface EcrRepositoryConfig {
  /**
   * Brands that need webapp ECR repositories
   */
  webappBrands?: string[];

  /**
   * Brands that need API ECR repositories
   */
  apiBrands?: string[];

  /**
   * Brands that need event handler ECR repositories
   * Creates repositories with naming pattern `{brand}-event-handlers`
   */
  eventHandlerBrands?: string[];

  /**
   * Brands that need scheduled job ECR repositories
   * Creates repositories with naming pattern `{brand}-jobs`
   */
  scheduledJobBrands?: string[];

  /**
   * Image tag mutability setting
   * @default TagMutability.MUTABLE
   */
  imageTagMutability?: ecr.TagMutability;

  /**
   * Enable image scanning on push
   * @default true
   */
  imageScanOnPush?: boolean;

  /**
   * Maximum number of images to retain
   * @default 10
   */
  maxImageCount?: number;
}

/**
 * Props for EcrRepositoryStack
 */
export interface EcrRepositoryStackProps extends BaseStackProps {
  /**
   * Repository configuration
   */
  repositoryConfig: EcrRepositoryConfig;
}

/**
 * ECR Repository Stack
 *
 * Creates ECR repositories for webapp and API services with:
 * - Lifecycle rules to limit image count
 * - SSM parameters for repository discovery
 * - CloudFormation outputs for cross-stack references
 */
export class EcrRepositoryStack extends BaseStack {
  /**
   * Map of brand name to webapp ECR repository
   */
  public readonly webappRepositories: Record<string, ecr.IRepository> = {};

  /**
   * Map of brand name to API ECR repository
   */
  public readonly apiRepositories: Record<string, ecr.IRepository> = {};

  /**
   * Map of brand name to event handler ECR repository
   */
  public readonly eventHandlerRepositories: Record<string, ecr.IRepository> = {};

  /**
   * Map of brand name to scheduled job ECR repository
   */
  public readonly scheduledJobRepositories: Record<string, ecr.IRepository> = {};

  constructor(scope: Construct, id: string, props: EcrRepositoryStackProps) {
    super(scope, id, 'ECR', props);

    const config = props.repositoryConfig;
    const webappBrands = config.webappBrands ?? [];
    const apiBrands = config.apiBrands ?? [];
    const eventHandlerBrands = config.eventHandlerBrands ?? [];
    const scheduledJobBrands = config.scheduledJobBrands ?? [];
    const imageTagMutability = config.imageTagMutability ?? ecr.TagMutability.MUTABLE;
    const imageScanOnPush = config.imageScanOnPush ?? true;
    const maxImageCount = config.maxImageCount ?? 10;

    // Create webapp repositories
    for (const brand of webappBrands) {
      const repository = this.createRepository(
        brand,
        'webapp',
        imageTagMutability,
        imageScanOnPush,
        maxImageCount,
      );
      this.webappRepositories[brand] = repository;
    }

    // Create API repositories
    for (const brand of apiBrands) {
      const repository = this.createRepository(
        brand,
        'api',
        imageTagMutability,
        imageScanOnPush,
        maxImageCount,
      );
      this.apiRepositories[brand] = repository;
    }

    // Create event handler repositories
    for (const brand of eventHandlerBrands) {
      const repository = this.createRepository(
        brand,
        'event-handlers',
        imageTagMutability,
        imageScanOnPush,
        maxImageCount,
      );
      this.eventHandlerRepositories[brand] = repository;
    }

    // Create scheduled job repositories
    for (const brand of scheduledJobBrands) {
      const repository = this.createRepository(
        brand,
        'jobs',
        imageTagMutability,
        imageScanOnPush,
        maxImageCount,
      );
      this.scheduledJobRepositories[brand] = repository;
    }
  }

  /**
   * Create an ECR repository with standard configuration
   */
  private createRepository(
    brand: string,
    serviceType: 'webapp' | 'api' | 'event-handlers' | 'jobs',
    imageTagMutability: ecr.TagMutability,
    imageScanOnPush: boolean,
    maxImageCount: number,
  ): ecr.Repository {
    const serviceName = `${brand}-${serviceType}`;
    const repositoryName = this.naming.resourceName(serviceName);
    // Convert service type to PascalCase for construct ID (e.g., 'event-handlers' -> 'EventHandlers')
    const serviceTypePascal = serviceType
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    const constructId = `${brand}${serviceTypePascal}Repository`;

    const repository = new ecr.Repository(this, constructId, {
      repositoryName,
      imageScanOnPush,
      imageTagMutability,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          description: `Keep last ${maxImageCount} images`,
          maxImageCount,
          rulePriority: 1,
        },
      ],
    });

    // Export repository ARN
    new cdk.CfnOutput(this, `${constructId}Arn`, {
      value: repository.repositoryArn,
      exportName: this.naming.exportName(`${serviceName}-ecr-arn`),
      description: `ECR Repository ARN for ${serviceName}`,
    });

    // Export repository URI
    new cdk.CfnOutput(this, `${constructId}Uri`, {
      value: repository.repositoryUri,
      exportName: this.naming.exportName(`${serviceName}-ecr-uri`),
      description: `ECR Repository URI for ${serviceName}`,
    });

    // Create SSM parameter for repository discovery
    const company = this.getStackConfig().company.toLowerCase();
    const environment = this.getStackConfig().environment;
    new ssm.StringParameter(this, `${constructId}SsmParam`, {
      parameterName: `/${company}/saas/${environment}/ecr/${brand}/${serviceType}/repository-name`,
      stringValue: repositoryName,
      description: `ECR repository name for ${serviceName}`,
    });

    return repository;
  }
}
