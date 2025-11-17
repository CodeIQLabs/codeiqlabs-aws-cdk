/**
 * CDK Constructs for AWS Identity Center (SSO) resources
 *
 * This module provides high-level CDK constructs that encapsulate the creation
 * of Identity Center resources with standardized naming, tagging, and output patterns.
 */

import * as cdk from 'aws-cdk-lib';
import * as sso from 'aws-cdk-lib/aws-sso';
import { Construct } from 'constructs';
import { generateStandardTags, convertToCfnTags } from '@codeiqlabs/aws-utils';
// Note: SSM parameter creation removed - implement directly if needed
import type {
  IdentityCenterConstructProps,
  PermissionSetConstructProps,
  AssignmentConstructProps,
  PermissionSetResult,
  IdentityCenterResult,
} from './types';

/**
 * High-level construct for AWS Identity Center resources
 *
 * This construct creates permission sets, assignments, and associated
 * SSM parameters and CloudFormation outputs with consistent naming.
 *
 * Note: AWS CloudFormation does not support creating Identity Center users.
 * Users must be created manually or through external identity providers.
 * This construct supports referencing users by principalId or principalKey.
 */
export class IdentityCenterConstruct extends Construct {
  /** Map of permission set names to their results */
  public readonly permissionSets: Record<string, PermissionSetResult> = {};

  /** List of created assignments */
  public readonly assignments: sso.CfnAssignment[] = [];

  /** The instance ARN used */
  public readonly instanceArn: string;

  /** The identity store ID used (if provided) */
  public readonly identityStoreId?: string;

  /** Map of user keys to user IDs (for principalKey resolution) */
  private readonly userIds: Record<string, string> = {};

  constructor(scope: Construct, id: string, props: IdentityCenterConstructProps) {
    super(scope, id);

    this.instanceArn = props.instanceArn;
    this.identityStoreId = props.identityStoreId;

    // Build user IDs map from provided users configuration
    // Note: Users cannot be created via CloudFormation, but we can map keys to IDs
    if (props.users) {
      for (const userConfig of props.users) {
        if (userConfig.userId) {
          this.userIds[userConfig.key] = userConfig.userId;
        } else {
          throw new Error(
            `User '${userConfig.key}' must have a userId. ` +
              `AWS CloudFormation does not support creating Identity Center users. ` +
              `Please create the user manually and provide the userId.`,
          );
        }
      }
    }

    // Create permission sets
    for (const psConfig of props.permissionSets) {
      const permissionSetConstruct = new PermissionSetConstruct(
        this,
        `PermissionSet${psConfig.name}`,
        {
          naming: props.naming,
          instanceArn: props.instanceArn,
          config: psConfig,
          owner: props.owner,
          company: props.company,
          createSsmParameters: props.createSsmParameters,
          createOutputs: props.createOutputs,
        },
      );

      this.permissionSets[psConfig.name] = {
        permissionSet: permissionSetConstruct.permissionSet,
        arn: permissionSetConstruct.arn,
        name: psConfig.name,
      };
    }

    // Create assignments if provided
    if (props.assignments && props.accountIds) {
      let assignmentCounter = 0;

      for (const assignmentConfig of props.assignments) {
        const permissionSetResult = this.permissionSets[assignmentConfig.permissionSetName];
        if (!permissionSetResult) {
          throw new Error(
            `Permission set ${assignmentConfig.permissionSetName} not found for assignment`,
          );
        }

        // Expand targetKeys into multiple assignments if provided
        const targetKeys = assignmentConfig.targetKeys
          ? assignmentConfig.targetKeys
          : assignmentConfig.targetKey
            ? [assignmentConfig.targetKey]
            : [];

        if (targetKeys.length === 0) {
          throw new Error('Either targetKey or targetKeys must be provided for assignment');
        }

        // Create an assignment for each target account
        for (const targetKey of targetKeys) {
          const expandedConfig = {
            ...assignmentConfig,
            targetKey,
            targetKeys: undefined, // Remove targetKeys from expanded config
          };

          const assignment = new AssignmentConstruct(this, `Assignment${assignmentCounter}`, {
            naming: props.naming,
            instanceArn: props.instanceArn,
            config: expandedConfig,
            accountIds: props.accountIds,
            userIds: this.userIds,
            permissionSetArn: permissionSetResult.arn,
          });

          this.assignments.push(assignment.assignment);
          assignmentCounter++;
        }
      }
    }

    // Create instance ARN output and SSM parameter
    if (props.createOutputs !== false) {
      new cdk.CfnOutput(this, 'InstanceArn', {
        value: props.instanceArn,
        description: 'AWS Identity Center Instance ARN',
        exportName: props.naming.exportName('SSO-Instance-ARN'),
      });
    }

    // Note: SSM parameter creation removed - implement directly if needed
  }

  /**
   * Get the result summary for this Identity Center construct
   */
  public getResult(): IdentityCenterResult {
    return {
      permissionSets: this.permissionSets,
      assignments: this.assignments,
      instanceArn: this.instanceArn,
      identityStoreId: this.identityStoreId,
    };
  }
}

/**
 * Construct for creating a single Permission Set
 */
export class PermissionSetConstruct extends Construct {
  /** The created permission set */
  public readonly permissionSet: sso.CfnPermissionSet;

  /** The permission set ARN */
  public readonly arn: string;

  constructor(scope: Construct, id: string, props: PermissionSetConstructProps) {
    super(scope, id);

    const { naming, instanceArn, config } = props;

    // Create the permission set with standardized configuration
    this.permissionSet = new sso.CfnPermissionSet(this, 'PermissionSet', {
      instanceArn,
      name: config.name,
      description: config.description,
      sessionDuration: config.sessionDuration ?? 'PT8H',
      managedPolicies: config.managedPolicies ?? [],
      inlinePolicy: config.inlinePolicy,
      tags: convertToCfnTags(
        generateStandardTags(naming.getConfig(), {
          component: 'Identity-Center',
          owner: props.owner,
          company: props.company,
          customTags: config.tags,
        }),
      ),
    });

    this.arn = this.permissionSet.attrPermissionSetArn;

    // Create CloudFormation output
    if (props.createOutputs !== false) {
      new cdk.CfnOutput(this, 'PermissionSetArn', {
        value: this.arn,
        description: `ARN of the ${config.name} permission set`,
        exportName: naming.exportName(`PermissionSet-${config.name}-Arn`),
      });
    }

    // Note: SSM parameter creation removed - implement directly if needed
  }
}

/**
 * Construct for creating a single Assignment
 */
export class AssignmentConstruct extends Construct {
  /** The created assignment */
  public readonly assignment: sso.CfnAssignment;

  constructor(scope: Construct, id: string, props: AssignmentConstructProps) {
    super(scope, id);

    const { instanceArn, config, accountIds, userIds, permissionSetArn } = props;

    // Resolve target account ID
    if (!config.targetKey) {
      throw new Error(
        'targetKey must be provided for assignment (targetKeys should be expanded before this point)',
      );
    }

    const targetAccountId = accountIds[config.targetKey] ?? config.targetKey;
    if (!targetAccountId) {
      throw new Error(`Cannot resolve account ID for target key: ${config.targetKey}`);
    }

    // Resolve principal ID (either direct or via principalKey)
    let principalId: string;
    if (config.principalId) {
      // Direct principal ID provided
      principalId = config.principalId;
    } else if (config.principalKey && userIds) {
      // Resolve principal ID from user key
      const resolvedUserId = userIds[config.principalKey];
      if (!resolvedUserId) {
        throw new Error(
          `Cannot resolve user ID for principal key: ${config.principalKey}. ` +
            `Available user keys: ${Object.keys(userIds).join(', ')}`,
        );
      }
      principalId = resolvedUserId;
    } else {
      throw new Error(
        `Either principalId or principalKey must be provided for ${config.principalType} assignment.`,
      );
    }

    // Create the assignment
    this.assignment = new sso.CfnAssignment(this, 'Assignment', {
      instanceArn,
      principalType: config.principalType,
      principalId,
      permissionSetArn,
      targetType: config.targetType,
      targetId: targetAccountId,
    });
  }
}
