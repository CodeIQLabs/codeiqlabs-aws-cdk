/**
 * CDK Constructs for Deployment Permissions resources
 *
 * This module provides high-level CDK constructs that encapsulate the creation
 * of deployment permission resources with standardized naming, tagging, and output patterns.
 */

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { generateStandardTags } from '@codeiqlabs/aws-utils';
import { createDeploymentParameter } from '../../common/ssm/convenience';
import type {
  DeploymentPermissionsConstructProps,
  CrossAccountRoleConstructProps,
  GitHubOidcProviderConstructProps,
  GitHubOidcRoleConstructProps,
  CrossAccountRoleResult,
  GitHubOidcProviderResult,
  GitHubOidcRoleResult,
  DeploymentPermissionsResult,
} from './types';

/**
 * High-level construct for deployment permissions
 *
 * This construct creates cross-account roles and GitHub OIDC providers/roles
 * for deploying to workload accounts with consistent naming and tagging.
 */
export class DeploymentPermissionsConstruct extends Construct {
  /** Cross-account role result (if created) */
  public readonly crossAccountRole?: CrossAccountRoleResult;

  /** GitHub OIDC provider result (if created) */
  public readonly githubOidcProvider?: GitHubOidcProviderResult;

  /** GitHub OIDC role result (if created) */
  public readonly githubOidcRole?: GitHubOidcRoleResult;

  constructor(scope: Construct, id: string, props: DeploymentPermissionsConstructProps) {
    super(scope, id);

    const { naming, config, project, environment, managementAccount } = props;

    // Apply standard tags to the construct
    cdk.Tags.of(this).add('Project', project.name);
    cdk.Tags.of(this).add('Environment', environment.name);
    cdk.Tags.of(this).add('Component', 'deployment-permissions');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    // Create cross-account deployment role if configured
    if (config.crossAccountRoles && config.crossAccountRoles.length > 0) {
      const crossAccountRoleConstruct = new CrossAccountRoleConstruct(this, 'CrossAccountRole', {
        naming,
        config: config.crossAccountRoles[0], // Use first cross-account role
        managementAccount,
        createSsmParameters: props.createSsmParameters,
        createOutputs: props.createOutputs,
      });
      this.crossAccountRole = crossAccountRoleConstruct.getResult();
    }

    // Create GitHub OIDC provider and role if enabled
    if (config.githubOidc?.enabled) {
      const githubOidcProviderConstruct = new GitHubOidcProviderConstruct(
        this,
        'GitHubOidcProvider',
        {
          naming,
          createSsmParameters: props.createSsmParameters,
          createOutputs: props.createOutputs,
        },
      );
      this.githubOidcProvider = githubOidcProviderConstruct.getResult();

      const githubOidcRoleConstruct = new GitHubOidcRoleConstruct(this, 'GitHubOidcRole', {
        naming,
        config: config.githubOidc,
        environment,
        oidcProvider: this.githubOidcProvider.provider,
        createSsmParameters: props.createSsmParameters,
        createOutputs: props.createOutputs,
      });
      this.githubOidcRole = githubOidcRoleConstruct.getResult();
    }
  }

  /**
   * Get the complete result summary for this deployment permissions construct
   */
  public getResult(): DeploymentPermissionsResult {
    return {
      crossAccountRole: this.crossAccountRole,
      githubOidcProvider: this.githubOidcProvider,
      githubOidcRole: this.githubOidcRole,
    };
  }
}

/**
 * Construct for creating a cross-account deployment role
 */
export class CrossAccountRoleConstruct extends Construct {
  /** The created IAM role */
  public readonly role: iam.Role;

  /** The role ARN */
  public readonly arn: string;

  /** The role name */
  public readonly name: string;

  constructor(scope: Construct, id: string, props: CrossAccountRoleConstructProps) {
    super(scope, id);

    const { naming, config, managementAccount } = props;

    // Generate role name using naming conventions
    this.name = naming.iamRoleName(config.roleName);

    // Create the cross-account role
    this.role = new iam.Role(this, 'Role', {
      roleName: this.name,
      assumedBy: new iam.AccountPrincipal(managementAccount.accountId),
      maxSessionDuration: config.sessionDuration
        ? cdk.Duration.parse(config.sessionDuration)
        : cdk.Duration.hours(1),
      description: `Cross-account deployment role for ${naming.getConfig().project} ${naming.getConfig().environment}`,
    });

    this.arn = this.role.roleArn;

    // Add comprehensive deployment permissions
    this.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'));

    // Add additional IAM permissions needed for CDK deployments
    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'iam:CreateRole',
          'iam:DeleteRole',
          'iam:UpdateRole',
          'iam:AttachRolePolicy',
          'iam:DetachRolePolicy',
          'iam:PutRolePolicy',
          'iam:DeleteRolePolicy',
          'iam:GetRole',
          'iam:GetRolePolicy',
          'iam:ListRolePolicies',
          'iam:ListAttachedRolePolicies',
          'iam:PassRole',
          'iam:TagRole',
          'iam:UntagRole',
          'iam:CreateInstanceProfile',
          'iam:DeleteInstanceProfile',
          'iam:AddRoleToInstanceProfile',
          'iam:RemoveRoleFromInstanceProfile',
          'iam:GetInstanceProfile',
        ],
        resources: ['*'],
      }),
    );

    // Apply standard tags
    const tags = generateStandardTags(naming.getConfig(), {
      component: 'deployment-permissions',
    });
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.role).add(key, value);
    });

    // Create CloudFormation output
    if (props.createOutputs !== false) {
      new cdk.CfnOutput(this, 'RoleArn', {
        value: this.arn,
        description: `Cross-account deployment role ARN for ${naming.getConfig().project} ${naming.getConfig().environment}`,
        exportName: naming.exportName('CrossAccount-Role-Arn'),
      });
    }

    // Create SSM parameter
    if (props.createSsmParameters !== false) {
      createDeploymentParameter(
        this,
        naming,
        'cross-account-role-arn',
        this.arn,
        `Cross-account deployment role ARN for ${naming.getConfig().project} ${naming.getConfig().environment}`,
      );
    }
  }

  /**
   * Get the result summary for this cross-account role construct
   */
  public getResult(): CrossAccountRoleResult {
    return {
      role: this.role,
      arn: this.arn,
      name: this.name,
    };
  }
}

/**
 * Construct for creating a GitHub OIDC provider
 */
export class GitHubOidcProviderConstruct extends Construct {
  /** The created OIDC provider */
  public readonly provider: iam.OpenIdConnectProvider;

  /** The provider ARN */
  public readonly arn: string;

  constructor(scope: Construct, id: string, props: GitHubOidcProviderConstructProps) {
    super(scope, id);

    const { naming } = props;

    // Create GitHub OIDC provider
    this.provider = new iam.OpenIdConnectProvider(this, 'Provider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    this.arn = this.provider.openIdConnectProviderArn;

    // Apply standard tags
    const tags = generateStandardTags(naming.getConfig(), {
      component: 'deployment-permissions',
    });
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.provider).add(key, value);
    });

    // Create CloudFormation output
    if (props.createOutputs !== false) {
      new cdk.CfnOutput(this, 'ProviderArn', {
        value: this.arn,
        description: `GitHub OIDC provider ARN for ${naming.getConfig().project} ${naming.getConfig().environment}`,
        exportName: naming.exportName('GitHub-OIDC-Provider-Arn'),
      });
    }

    // Create SSM parameter
    if (props.createSsmParameters !== false) {
      createDeploymentParameter(
        this,
        naming,
        'github-oidc-provider-arn',
        this.arn,
        `GitHub OIDC provider ARN for ${naming.getConfig().project} ${naming.getConfig().environment}`,
      );
    }
  }

  /**
   * Get the result summary for this GitHub OIDC provider construct
   */
  public getResult(): GitHubOidcProviderResult {
    return {
      provider: this.provider,
      arn: this.arn,
    };
  }
}

/**
 * Construct for creating a GitHub OIDC role
 */
export class GitHubOidcRoleConstruct extends Construct {
  /** The created IAM role */
  public readonly role: iam.Role;

  /** The role ARN */
  public readonly arn: string;

  /** The role name */
  public readonly name: string;

  constructor(scope: Construct, id: string, props: GitHubOidcRoleConstructProps) {
    super(scope, id);

    const { naming, config, oidcProvider } = props;

    // Generate role name using naming conventions
    this.name = naming.iamRoleName('GitHub-OIDC-Deployment');

    // Create conditions for repository access
    const conditions: { [key: string]: any } = {
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      },
      StringLike: {
        'token.actions.githubusercontent.com:sub': config.repositoryPattern,
      },
    };

    // Create the GitHub OIDC role
    this.role = new iam.Role(this, 'Role', {
      roleName: this.name,
      assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, conditions),
      maxSessionDuration: cdk.Duration.hours(1),
      description: `GitHub OIDC deployment role for ${naming.getConfig().project} ${naming.getConfig().environment}`,
    });

    this.arn = this.role.roleArn;

    // Add the same permissions as cross-account role
    this.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'));

    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'iam:CreateRole',
          'iam:DeleteRole',
          'iam:UpdateRole',
          'iam:AttachRolePolicy',
          'iam:DetachRolePolicy',
          'iam:PutRolePolicy',
          'iam:DeleteRolePolicy',
          'iam:GetRole',
          'iam:GetRolePolicy',
          'iam:ListRolePolicies',
          'iam:ListAttachedRolePolicies',
          'iam:PassRole',
          'iam:TagRole',
          'iam:UntagRole',
          'iam:CreateInstanceProfile',
          'iam:DeleteInstanceProfile',
          'iam:AddRoleToInstanceProfile',
          'iam:RemoveRoleFromInstanceProfile',
          'iam:GetInstanceProfile',
        ],
        resources: ['*'],
      }),
    );

    // Apply standard tags
    const tags = generateStandardTags(naming.getConfig(), {
      component: 'deployment-permissions',
    });
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.role).add(key, value);
    });

    // Create CloudFormation output
    if (props.createOutputs !== false) {
      new cdk.CfnOutput(this, 'RoleArn', {
        value: this.arn,
        description: `GitHub OIDC deployment role ARN for ${naming.getConfig().project} ${naming.getConfig().environment}`,
        exportName: naming.exportName('GitHub-OIDC-Role-Arn'),
      });
    }

    // Create SSM parameter
    if (props.createSsmParameters !== false) {
      createDeploymentParameter(
        this,
        naming,
        'github-oidc-role-arn',
        this.arn,
        `GitHub OIDC deployment role ARN for ${naming.getConfig().project} ${naming.getConfig().environment}`,
      );
    }
  }

  /**
   * Get the result summary for this GitHub OIDC role construct
   */
  public getResult(): GitHubOidcRoleResult {
    return {
      role: this.role,
      arn: this.arn,
      name: this.name,
    };
  }
}
