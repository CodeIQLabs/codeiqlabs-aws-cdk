import { Construct } from 'constructs';
import { CfnOutput, Fn } from 'aws-cdk-lib';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { BaseStack, type BaseStackProps } from '../base/base-stack';
import { Route53HostedZoneConstruct } from '../../constructs/route53/constructs';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Root Domain Stack
 *
 * Manages Route53 hosted zones and cross-account delegation roles in the management account.
 *
 * **Architecture:**
 * - Deployed in Management Account
 * - Creates/imports Route53 hosted zones for each domain
 * - Creates per-domain IAM delegation roles for subdomain delegation
 * - Exports hosted zone IDs and role ARNs to SSM for workload accounts
 * - Exports name servers for domain registrar configuration
 *
 * **Cross-Account Subdomain Delegation:**
 * For domains with createDelegationRole: true, creates an IAM role that allows
 * workload accounts to create NS records for subdomain delegation.
 * Example: NonProd account can create NS record for nprd.savvue.com in savvue.com zone.
 *
 * **Manifest Configuration:**
 * ```yaml
 * domains:
 *   registeredDomains:
 *     - name: "codeiqlabs.com"
 *       createDelegationRole: false  # Marketing-only
 *     - name: "savvue.com"
 *       createDelegationRole: true
 *       allowedEnvironments: [nprd, prod]
 * ```
 *
 * **Deployment Order:** Deploy this stack BEFORE workload SubdomainZoneStack
 * **Deployment Frequency:** Rare (only when adding new domains)
 */

export interface RootDomainStackProps extends BaseStackProps {
  /** Unified application configuration from manifest */
  config: UnifiedAppConfig;
}

/**
 * Root Domain Stack implementation
 */
export class RootDomainStack extends BaseStack {
  /** Map of domain names to hosted zones */
  private readonly hostedZones: Map<string, IHostedZone> = new Map();

  constructor(scope: Construct, id: string, props: RootDomainStackProps) {
    super(scope, id, 'RootDomain', props);

    // Get registeredDomains from manifest (domains.registeredDomains)
    const registeredDomains = (props.config.domains as any)?.registeredDomains as any[] | undefined;

    if (!registeredDomains || registeredDomains.length === 0) {
      throw new Error(
        'No domains.registeredDomains found in manifest. Please configure domains.registeredDomains array.',
      );
    }

    // Create or import hosted zones for each domain
    let index = 0;
    for (const domain of registeredDomains) {
      this.createOrImportHostedZone(domain, index++, props.config);
    }
  }

  /**
   * Creates a new hosted zone or imports an existing one
   * Also creates delegation role if createDelegationRole is true
   */
  private createOrImportHostedZone(domain: any, index: number, config: UnifiedAppConfig): void {
    // Validate domain configuration
    if (!domain.name) {
      throw new Error(`Domain at index ${index} is missing required "name" field`);
    }

    const domainName = domain.name;
    let hostedZone: IHostedZone;

    if (domain.hostedZoneId) {
      // Import existing hosted zone
      hostedZone = HostedZone.fromHostedZoneAttributes(this, `HostedZone${index}`, {
        hostedZoneId: domain.hostedZoneId,
        zoneName: domainName,
      });

      // Add output for imported zone
      new CfnOutput(this, `${this.sanitizeDomainName(domainName)}ImportedZoneId`, {
        value: domain.hostedZoneId,
        description: `Imported hosted zone ID for ${domainName}`,
        exportName: this.naming.exportName(`${this.sanitizeDomainName(domainName)}-hosted-zone-id`),
      });
    } else {
      // Create new hosted zone using construct
      const stackConfig = this.getStackConfig();
      const hostedZoneConstruct = new Route53HostedZoneConstruct(this, `HostedZone${index}`, {
        naming: this.naming,
        environment: stackConfig.environment,
        company: stackConfig.company,
        project: stackConfig.project,
        owner: stackConfig.owner,
        domainName,
        comment: `Hosted zone for ${domainName} - managed by ${stackConfig.project}`,
      });

      hostedZone = hostedZoneConstruct.hostedZone;

      // Export hosted zone ID
      new CfnOutput(this, `${this.sanitizeDomainName(domainName)}HostedZoneId`, {
        value: hostedZone.hostedZoneId,
        description: `Hosted zone ID for ${domainName}`,
        exportName: this.naming.exportName(`${this.sanitizeDomainName(domainName)}-hosted-zone-id`),
      });

      // Export name servers (use Fn.join for token list)
      new CfnOutput(this, `${this.sanitizeDomainName(domainName)}NameServers`, {
        value: Fn.join(',', hostedZone.hostedZoneNameServers || []),
        description: `Name servers for ${domainName}`,
        exportName: this.naming.exportName(`${this.sanitizeDomainName(domainName)}-name-servers`),
      });
    }

    // Store hosted zone for potential use by other methods
    this.hostedZones.set(domainName, hostedZone);

    // Export hosted zone name for reference
    new CfnOutput(this, `${this.sanitizeDomainName(domainName)}ZoneName`, {
      value: domainName,
      description: `Zone name for ${domainName}`,
      exportName: this.naming.exportName(`${this.sanitizeDomainName(domainName)}-zone-name`),
    });

    // Store zone ID in SSM for workload accounts to reference
    new ssm.StringParameter(this, `${this.sanitizeDomainName(domainName)}ZoneIdParam`, {
      parameterName: `/codeiqlabs/route53/${domainName}/zone-id`,
      stringValue: hostedZone.hostedZoneId,
      description: `Hosted zone ID for ${domainName}`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // Create delegation role if requested
    if (domain.createDelegationRole) {
      this.createDelegationRole(
        domainName,
        hostedZone,
        domain.allowedEnvironments || [],
        config,
        index,
      );
    }
  }

  /**
   * Creates a cross-account delegation role for subdomain delegation
   * Allows workload accounts to create NS records in this hosted zone
   */
  private createDelegationRole(
    domainName: string,
    hostedZone: IHostedZone,
    allowedEnvironments: string[],
    config: UnifiedAppConfig,
    index: number,
  ): void {
    // Resolve account IDs from environment names
    const environments = (config as any).environments;
    const allowedAccounts = allowedEnvironments
      .map((env) => {
        const envConfig = environments[env];
        if (!envConfig?.accountId) {
          throw new Error(`Environment ${env} not found or missing accountId in manifest`);
        }
        return envConfig.accountId;
      })
      .filter((accountId) => accountId); // Filter out any undefined values

    if (allowedAccounts.length === 0) {
      throw new Error(
        `No valid accounts found for delegation role for ${domainName}. Check allowedEnvironments.`,
      );
    }

    // Create role name: Route53-Delegation-savvue-com
    const roleName = `Route53-Delegation-${domainName.replace(/\./g, '-')}`;

    // Create IAM role with cross-account trust
    const delegationRole = new iam.Role(this, `DelegationRole${index}`, {
      roleName,
      description: `Allows workload accounts to create NS delegation records in ${domainName} hosted zone`,
      assumedBy: new iam.CompositePrincipal(
        ...allowedAccounts.map((accountId) => new iam.AccountPrincipal(accountId)),
      ),
      inlinePolicies: {
        Route53Delegation: new iam.PolicyDocument({
          statements: [
            // Allow NS record creation in the specific hosted zone
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['route53:ChangeResourceRecordSets', 'route53:GetChange'],
              resources: [`arn:aws:route53:::hostedzone/${hostedZone.hostedZoneId}`],
              conditions: {
                'ForAllValues:StringEquals': {
                  'route53:ChangeResourceRecordSetsRecordTypes': ['NS'],
                },
              },
            }),
            // Allow listing hosted zones by name (required by CrossAccountZoneDelegationRecord)
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['route53:ListHostedZonesByName'],
              resources: ['*'], // ListHostedZonesByName doesn't support resource-level permissions
            }),
          ],
        }),
      },
    });

    // Export role ARN to SSM for workload accounts
    new ssm.StringParameter(this, `DelegationRoleArn${index}`, {
      parameterName: `/codeiqlabs/route53/${domainName}/delegation-role-arn`,
      stringValue: delegationRole.roleArn,
      description: `Delegation role ARN for ${domainName} subdomain delegation`,
      tier: ssm.ParameterTier.STANDARD,
    });

    // CloudFormation output
    new CfnOutput(this, `${this.sanitizeDomainName(domainName)}DelegationRoleArn`, {
      value: delegationRole.roleArn,
      description: `Delegation role ARN for ${domainName}`,
      exportName: this.naming.exportName(
        `${this.sanitizeDomainName(domainName)}-delegation-role-arn`,
      ),
    });
  }

  /**
   * Sanitizes domain name for use in CloudFormation logical IDs
   * Replaces dots with dashes and capitalizes first letter of each segment
   */
  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }

  /**
   * Gets a hosted zone by domain name
   */
  public getHostedZone(domainName: string): IHostedZone | undefined {
    return this.hostedZones.get(domainName);
  }

  /**
   * Gets all hosted zones
   */
  public getAllHostedZones(): Map<string, IHostedZone> {
    return this.hostedZones;
  }
}
