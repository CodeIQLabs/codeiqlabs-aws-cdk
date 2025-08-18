/**
 * CDK Constructs for AWS Organizations resources
 *
 * This module provides high-level CDK constructs that encapsulate the creation
 * of Organizations resources with standardized naming, tagging, and output patterns.
 */

import * as cdk from 'aws-cdk-lib';
import * as orgs from 'aws-cdk-lib/aws-organizations';
import { Construct } from 'constructs';
import { createAccountIdParameter, createOrganizationParameter } from '../ssm/convenience';
import type {
  OrganizationConstructProps,
  OrganizationalUnitConstructProps,
  AccountConstructProps,
  AccountResult,
  OrganizationalUnitResult,
  OrganizationResult,
} from './types';

/**
 * High-level construct for AWS Organizations
 *
 * This construct creates or adopts an organization, organizational units,
 * and accounts with consistent naming and parameter creation.
 */
export class OrganizationConstruct extends Construct {
  /** The organization (if created) */
  public readonly organization?: orgs.CfnOrganization;

  /** Map of OU keys to their results */
  public readonly organizationalUnits: Record<string, OrganizationalUnitResult> = {};

  /** Flattened map of all account keys to account IDs */
  public readonly accountIds: Record<string, string> = {};

  /** The root ID used */
  public readonly rootId: string;

  /** The mode used */
  public readonly mode: string;

  constructor(scope: Construct, id: string, props: OrganizationConstructProps) {
    super(scope, id);

    this.rootId = props.rootId;
    this.mode = props.mode;

    const isAdoptMode = props.mode === 'adopt';

    // Create or adopt the Organization
    if (!isAdoptMode) {
      this.organization = new orgs.CfnOrganization(this, 'Organization', {
        featureSet: props.featureSet ?? 'ALL',
      });
    }

    // Create organizational units
    for (const ouConfig of props.organizationalUnits) {
      const ouConstruct = new OrganizationalUnitConstruct(this, `OU${ouConfig.key}`, {
        naming: props.naming,
        mode: props.mode,
        parentId: props.rootId,
        config: ouConfig,
        createSsmParameters: props.createSsmParameters,
        createOutputs: props.createOutputs,
      });

      this.organizationalUnits[ouConfig.key] = ouConstruct.getResult();

      // Add accounts to flattened map
      Object.assign(this.accountIds, ouConstruct.accountIds);
    }

    // Create root ID SSM parameter
    if (props.createSsmParameters !== false) {
      createOrganizationParameter(
        this,
        props.naming,
        'root-id',
        props.rootId,
        'AWS Organization Root ID',
      );
    }
  }

  /**
   * Get the result summary for this Organization construct
   */
  public getResult(): OrganizationResult {
    return {
      organization: this.organization,
      organizationalUnits: this.organizationalUnits,
      accountIds: this.accountIds,
      rootId: this.rootId,
      mode: this.mode as any,
    };
  }
}

/**
 * Construct for creating a single Organizational Unit
 */
export class OrganizationalUnitConstruct extends Construct {
  /** The OU ID */
  public readonly ouId: string;

  /** Map of account keys to their results */
  public readonly accounts: Record<string, AccountResult> = {};

  /** Flattened map of account keys to account IDs */
  public readonly accountIds: Record<string, string> = {};

  /** The created OU resource (if in create mode) */
  public readonly organizationalUnit?: orgs.CfnOrganizationalUnit;

  constructor(scope: Construct, id: string, props: OrganizationalUnitConstructProps) {
    super(scope, id);

    const { naming, mode, parentId, config } = props;
    const isAdoptMode = mode === 'adopt';

    // Store config for later access
    (this as any)._config = config;

    if (isAdoptMode) {
      // Adopt mode: validate that ouId is provided
      if (!config.ouId) {
        throw new Error(
          `organizationalUnits[${config.key}].ouId is required when organization.mode=adopt`,
        );
      }
      this.ouId = config.ouId;
    } else {
      // Create mode: Create Organizational Unit
      this.organizationalUnit = new orgs.CfnOrganizationalUnit(this, 'OrganizationalUnit', {
        name: config.name,
        parentId: parentId,
      });
      this.ouId = this.organizationalUnit.attrId;
    }

    // Create accounts
    for (const accountConfig of config.accounts) {
      const accountConstruct = new AccountConstruct(this, `Account${accountConfig.key}`, {
        naming,
        mode,
        parentId: this.ouId,
        config: accountConfig,
        createSsmParameters: props.createSsmParameters,
        createOutputs: props.createOutputs,
      });

      const accountResult = accountConstruct.getResult();
      this.accounts[accountConfig.key] = accountResult;
      this.accountIds[accountConfig.key] = accountResult.accountId;
    }

    // Create OU ID SSM parameter
    if (props.createSsmParameters !== false) {
      createOrganizationParameter(
        this,
        naming,
        `${config.key}-ou-id`,
        this.ouId,
        `Organizational Unit ID for ${config.name}`,
      );
    }
  }

  /**
   * Get the result summary for this OU construct
   */
  public getResult(): OrganizationalUnitResult {
    const config = (this as any)._config as OrganizationalUnitConstructProps['config'];
    return {
      ouId: this.ouId,
      key: config?.key || 'unknown',
      name: config?.name || 'unknown',
      accounts: this.accounts,
      organizationalUnit: this.organizationalUnit,
    };
  }
}

/**
 * Construct for creating a single Account
 */
export class AccountConstruct extends Construct {
  /** The account ID */
  public readonly accountId: string;

  /** The created account resource (if in create mode) */
  public readonly account?: orgs.CfnAccount;

  constructor(scope: Construct, id: string, props: AccountConstructProps) {
    super(scope, id);

    const { naming, mode, parentId, config } = props;
    const isAdoptMode = mode === 'adopt';

    // Store config for later access
    (this as any)._config = config;

    if (isAdoptMode) {
      // Adopt mode: validate that accountId is provided
      if (!config.accountId) {
        throw new Error(
          `Account[${config.key}].accountId is required when organization.mode=adopt`,
        );
      }
      this.accountId = config.accountId;
    } else {
      // Create mode: Create Account
      this.account = new orgs.CfnAccount(this, 'Account', {
        accountName: config.name,
        email: config.email,
        parentIds: [parentId],
        tags: Object.entries(config.tags ?? {}).map(([key, value]) => ({
          key,
          value: String(value),
        })),
      });
      this.accountId = this.account.attrAccountId;
    }

    // Create CloudFormation output
    if (props.createOutputs !== false) {
      new cdk.CfnOutput(this, 'AccountId', {
        value: this.accountId,
        description: `Account ID for ${config.key}`,
        exportName: naming.exportName(`${config.key}-AccountId`),
      });
    }

    // Create SSM parameter
    if (props.createSsmParameters !== false) {
      createAccountIdParameter(this, naming, config.key, this.accountId, config.name);
    }
  }

  /**
   * Get the result summary for this Account construct
   */
  public getResult(): AccountResult {
    const config = (this as any)._config as AccountConstructProps['config'];
    return {
      accountId: this.accountId,
      key: config.key,
      name: config.name,
      account: this.account,
    };
  }
}
