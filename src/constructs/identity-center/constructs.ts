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
import { createIdentityCenterParameter } from '../../common/ssm/convenience';
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
 */
export class IdentityCenterConstruct extends Construct {
  /** Map of permission set names to their results */
  public readonly permissionSets: Record<string, PermissionSetResult> = {};

  /** List of created assignments */
  public readonly assignments: sso.CfnAssignment[] = [];

  /** The instance ARN used */
  public readonly instanceArn: string;

  constructor(scope: Construct, id: string, props: IdentityCenterConstructProps) {
    super(scope, id);

    this.instanceArn = props.instanceArn;

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
      for (const [index, assignmentConfig] of props.assignments.entries()) {
        const permissionSetResult = this.permissionSets[assignmentConfig.permissionSetName];
        if (!permissionSetResult) {
          throw new Error(
            `Permission set ${assignmentConfig.permissionSetName} not found for assignment`,
          );
        }

        const assignment = new AssignmentConstruct(this, `Assignment${index}`, {
          naming: props.naming,
          instanceArn: props.instanceArn,
          config: assignmentConfig,
          accountIds: props.accountIds,
          permissionSetArn: permissionSetResult.arn,
        });

        this.assignments.push(assignment.assignment);
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

    if (props.createSsmParameters !== false) {
      createIdentityCenterParameter(
        this,
        props.naming,
        'instance-arn',
        props.instanceArn,
        'AWS Identity Center Instance ARN',
      );
    }
  }

  /**
   * Get the result summary for this Identity Center construct
   */
  public getResult(): IdentityCenterResult {
    return {
      permissionSets: this.permissionSets,
      assignments: this.assignments,
      instanceArn: this.instanceArn,
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

    // Create SSM parameter
    if (props.createSsmParameters !== false) {
      createIdentityCenterParameter(
        this,
        naming,
        `permission-set-${config.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-arn`,
        this.arn,
        `Permission Set ARN for ${config.name}`,
      );
    }
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

    const { instanceArn, config, accountIds, permissionSetArn } = props;

    // Resolve target account ID
    const targetAccountId = accountIds[config.targetKey] ?? config.targetKey;
    if (!targetAccountId) {
      throw new Error(`Cannot resolve account ID for target key: ${config.targetKey}`);
    }

    // Validate principal ID is provided
    if (!config.principalId) {
      throw new Error(
        `Principal ID is required for ${config.principalType} assignment. ` +
          `Please provide the principalId directly from AWS Identity Center.`,
      );
    }

    // Create the assignment
    this.assignment = new sso.CfnAssignment(this, 'Assignment', {
      instanceArn,
      principalType: config.principalType,
      principalId: config.principalId,
      permissionSetArn,
      targetType: config.targetType,
      targetId: targetAccountId,
    });
  }
}
