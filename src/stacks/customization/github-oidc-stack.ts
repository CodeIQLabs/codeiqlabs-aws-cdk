import type { Construct } from 'constructs';
import { BaseStack, type BaseStackProps } from '../base';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

/**
 * Configuration for a GitHub repository that can assume the OIDC role
 */
export interface GitHubRepositoryConfig {
  /** GitHub organization or user name */
  owner: string;
  /** Repository name */
  repo: string;
  /** Branch filter (e.g., 'main', 'refs/heads/main', '*') - defaults to 'main' */
  branch?: string;
  /** Allow version tags (e.g., 'v*.*.*') - defaults to true */
  allowTags?: boolean;
}

export interface GitHubOidcStackProps extends BaseStackProps {
  /** List of GitHub repositories that can assume the role */
  repositories: GitHubRepositoryConfig[];
  /** ECR repository name prefix for push permissions (e.g., 'codeiqlabs-saas') */
  ecrRepositoryPrefix?: string;
  /** S3 bucket name prefix for webapp deployment (e.g., 'codeiqlabs-saas') */
  s3BucketPrefix?: string;
  /** ECS cluster name prefix for service updates (e.g., 'codeiqlabs-saas') */
  ecsClusterPrefix?: string;
}

/**
 * GitHub OIDC Stack
 *
 * Creates GitHub Actions OIDC identity provider and IAM role for CI/CD deployments.
 * This enables GitHub Actions workflows to authenticate with AWS without long-lived credentials.
 *
 * The stack creates:
 * - OIDC Identity Provider for GitHub Actions (if not already exists)
 * - IAM Role with trust policy for specified GitHub repositories
 * - Permissions for ECR push, ECS update, and S3 deployment
 */
export class GitHubOidcStack extends BaseStack {
  /** The OIDC provider for GitHub Actions */
  public readonly oidcProvider: iam.IOpenIdConnectProvider;

  /** The IAM role that GitHub Actions can assume */
  public readonly role: iam.Role;

  /** The ARN of the role */
  public readonly roleArn: string;

  constructor(scope: Construct, id: string, props: GitHubOidcStackProps) {
    super(scope, id, 'GitHubOIDC', props);

    const {
      repositories,
      ecrRepositoryPrefix = 'codeiqlabs-saas',
      s3BucketPrefix = 'codeiqlabs-saas',
      ecsClusterPrefix = 'codeiqlabs-saas',
    } = props;

    const accountId = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    // GitHub OIDC provider thumbprint (GitHub's certificate thumbprint)
    const githubOidcThumbprint = '6938fd4d98bab03faadb97b34396831e3780aea1';

    // Create the OIDC provider
    this.oidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: [githubOidcThumbprint],
    });

    // Build the trust policy conditions for allowed repositories
    const allowedSubjects = this.buildAllowedSubjects(repositories);

    // Create the IAM role with OIDC trust policy
    this.role = new iam.Role(this, 'GitHubActionsRole', {
      roleName: 'GitHubActionsRole',
      description: 'Role for GitHub Actions CI/CD deployments via OIDC',
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.FederatedPrincipal(
        this.oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': allowedSubjects,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });

    // Add permissions
    this.addEcrPermissions(ecrRepositoryPrefix, accountId, region);
    this.addEcsPermissions(ecsClusterPrefix, accountId, region);
    this.addS3Permissions(s3BucketPrefix);
    this.addSsmPermissions();

    this.roleArn = this.role.roleArn;

    // Export the role ARN
    new cdk.CfnOutput(this, 'GitHubActionsRoleArn', {
      value: this.roleArn,
      description: 'ARN of the GitHub Actions OIDC Role',
      exportName: this.naming.exportName('GitHubActionsRoleArn'),
    });

    new cdk.CfnOutput(this, 'OidcProviderArn', {
      value: this.oidcProvider.openIdConnectProviderArn,
      description: 'ARN of the GitHub OIDC Provider',
      exportName: this.naming.exportName('GitHubOidcProviderArn'),
    });
  }

  private buildAllowedSubjects(repositories: GitHubRepositoryConfig[]): string[] {
    const subjects: string[] = [];

    for (const repo of repositories) {
      const { owner, repo: repoName, branch = 'main', allowTags = true } = repo;

      // Allow the specified branch
      if (branch === '*') {
        subjects.push('repo:' + owner + '/' + repoName + ':ref:refs/heads/*');
      } else if (branch.startsWith('refs/')) {
        subjects.push('repo:' + owner + '/' + repoName + ':' + branch);
      } else {
        subjects.push('repo:' + owner + '/' + repoName + ':ref:refs/heads/' + branch);
      }

      // Allow version tags if enabled
      if (allowTags) {
        subjects.push('repo:' + owner + '/' + repoName + ':ref:refs/tags/v*');
      }
    }

    return subjects;
  }

  private addEcrPermissions(prefix: string, accountId: string, region: string): void {
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECRGetAuthorizationToken',
        effect: iam.Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    );

    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECRPushPermissions',
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'ecr:PutImage',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:DescribeImages',
          'ecr:DescribeRepositories',
          'ecr:ListImages',
        ],
        resources: ['arn:aws:ecr:' + region + ':' + accountId + ':repository/' + prefix + '-*'],
      }),
    );
  }

  private addEcsPermissions(prefix: string, accountId: string, region: string): void {
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECSUpdateService',
        effect: iam.Effect.ALLOW,
        actions: [
          'ecs:UpdateService',
          'ecs:DescribeServices',
          'ecs:DescribeTasks',
          'ecs:DescribeTaskDefinition',
          'ecs:ListTasks',
          'ecs:DescribeClusters',
        ],
        resources: [
          'arn:aws:ecs:' + region + ':' + accountId + ':cluster/' + prefix + '-*',
          'arn:aws:ecs:' + region + ':' + accountId + ':service/' + prefix + '-*/*',
          'arn:aws:ecs:' + region + ':' + accountId + ':task/' + prefix + '-*/*',
          'arn:aws:ecs:' + region + ':' + accountId + ':task-definition/*:*',
        ],
      }),
    );
  }

  private addS3Permissions(prefix: string): void {
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'S3WebappDeployment',
        effect: iam.Effect.ALLOW,
        actions: [
          's3:PutObject',
          's3:PutObjectAcl',
          's3:GetObject',
          's3:DeleteObject',
          's3:ListBucket',
          's3:GetBucketLocation',
        ],
        resources: ['arn:aws:s3:::' + prefix + '-*', 'arn:aws:s3:::' + prefix + '-*/*'],
      }),
    );

    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'S3ListBuckets',
        effect: iam.Effect.ALLOW,
        actions: ['s3:ListAllMyBuckets'],
        resources: ['*'],
      }),
    );
  }

  private addSsmPermissions(): void {
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SSMReadParameters',
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
        resources: ['arn:aws:ssm:*:' + cdk.Stack.of(this).account + ':parameter/codeiqlabs/*'],
      }),
    );
  }
}
