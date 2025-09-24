import { Construct } from 'constructs';
import { CfnOutput, CustomResource, Duration } from 'aws-cdk-lib';
import { HostedZone, IHostedZone, NsRecord } from 'aws-cdk-lib/aws-route53';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { ManagementBaseStack, type ManagementBaseStackProps } from '../base';
import type { ManagementAppConfig } from '@codeiqlabs/aws-utils';

/**
 * Domain Delegation Stack
 *
 * This reusable stack manages cross-account domain delegation for any organization.
 * It creates NS records in the parent hosted zone that delegate subdomains to
 * hosted zones in workload accounts.
 *
 * The stack uses a custom resource to query the workload account hosted zones
 * and automatically create the appropriate NS records for delegation.
 *
 * **Features:**
 * - Automatic cross-account hosted zone discovery
 * - Dynamic NS record creation for subdomain delegation
 * - Support for multiple delegations from a single parent domain
 * - Configurable cross-account role names
 * - Comprehensive error handling and logging
 *
 * **Usage:**
 * ```typescript
 * new DomainDelegationStack(this, 'DomainDelegation', {
 *   env: { account: 'management-account-id', region: 'us-east-1' },
 *   config: manifestConfig, // Must include domains configuration
 *   naming: resourceNaming,
 *   tags: standardTags,
 * });
 * ```
 *
 * **Manifest Configuration:**
 * ```yaml
 * domains:
 *   enabled: true
 *   registeredDomains:
 *     - name: "example.com"
 *       hostedZoneId: "Z1234567890ABC"
 *       delegations:
 *         - subdomain: "www"
 *           targetAccount: "123456789012"
 *           targetEnvironment: "prod"
 *           purpose: "website"
 *           enabled: true
 * ```
 */

/**
 * Props for DomainDelegationStack
 */
export interface DomainDelegationStackProps extends ManagementBaseStackProps {
  /** The complete management manifest configuration */
  config: ManagementAppConfig;
}

export class DomainDelegationStack extends ManagementBaseStack {
  private parentHostedZone: IHostedZone | undefined;

  constructor(scope: Construct, id: string, props: DomainDelegationStackProps) {
    super(scope, id, 'DomainDelegation', props);

    // TODO: Fix type issue with domains property
    const domainConfig = (props.config as any).domains;
    if (!domainConfig?.enabled || !domainConfig.registeredDomains?.length) {
      throw new Error('Domain configuration is required for domain delegation stack');
    }

    const primaryDomain = domainConfig.registeredDomains[0];
    if (!primaryDomain.delegations?.length) {
      // No delegations configured, skip stack creation
      return;
    }

    // Import the existing hosted zone for the parent domain
    this.parentHostedZone = HostedZone.fromHostedZoneAttributes(this, 'ParentHostedZone', {
      hostedZoneId: primaryDomain.hostedZoneId,
      zoneName: primaryDomain.name,
    });

    // Create Lambda function for querying workload account hosted zones
    const delegationFunction = this.createDelegationQueryFunction();

    // Grant permissions to assume roles in workload accounts
    delegationFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::*:role/CrossAccount-Deployment`,
          `arn:aws:iam::*:role/*-CrossAccount-Deployment-Role`,
        ],
      }),
    );

    // Create custom resource provider
    const delegationProvider = new Provider(this, 'DelegationProvider', {
      onEventHandler: delegationFunction,
    });

    // Create NS records for each delegation
    this.createDelegationRecords(primaryDomain, delegationProvider);

    // Export parent hosted zone information
    this.exportHostedZoneInfo(primaryDomain);
  }

  /**
   * Creates the Lambda function that queries workload accounts for hosted zone details
   */
  private createDelegationQueryFunction(): Function {
    return new Function(this, 'DelegationFunction', {
      runtime: Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: Duration.minutes(5),
      description: 'Queries workload accounts for hosted zone details to create domain delegations',
      code: Code.fromInline(`
        const { Route53Client, GetHostedZoneCommand, ListHostedZonesCommand } = require('@aws-sdk/client-route53');
        const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');

        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          
          const { RequestType, ResourceProperties } = event;
          const { TargetAccount, SubdomainName, RoleName } = ResourceProperties;
          
          if (RequestType === 'Delete') {
            return { PhysicalResourceId: \`delegation-\${SubdomainName}\` };
          }
          
          try {
            // Assume role in target account
            const stsClient = new STSClient({});
            const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
              RoleArn: \`arn:aws:iam::\${TargetAccount}:role/\${RoleName}\`,
              RoleSessionName: 'DomainDelegationQuery'
            }));
            
            // Create Route53 client with assumed role credentials
            const route53Client = new Route53Client({
              credentials: {
                accessKeyId: assumeRoleResponse.Credentials.AccessKeyId,
                secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey,
                sessionToken: assumeRoleResponse.Credentials.SessionToken
              }
            });
            
            // List hosted zones and find the one for our subdomain
            const { HostedZones } = await route53Client.send(new ListHostedZonesCommand({}));
            const targetZone = HostedZones.find(zone => zone.Name === \`\${SubdomainName}.\`);
            
            if (!targetZone) {
              throw new Error(\`Hosted zone for \${SubdomainName} not found in account \${TargetAccount}\`);
            }
            
            // Get the hosted zone details to retrieve name servers
            const { HostedZone } = await route53Client.send(new GetHostedZoneCommand({
              Id: targetZone.Id
            }));
            
            return {
              PhysicalResourceId: \`delegation-\${SubdomainName}\`,
              Data: {
                HostedZoneId: targetZone.Id.replace('/hostedzone/', ''),
                NameServers: HostedZone.DelegationSet?.NameServers || []
              }
            };
          } catch (error) {
            console.error('Error:', error);
            throw error;
          }
        };
      `),
    });
  }

  /**
   * Creates NS records for each configured delegation
   */
  private createDelegationRecords(primaryDomain: any, delegationProvider: Provider): void {
    primaryDomain.delegations.forEach((delegation: any, index: number) => {
      if (!delegation.enabled) {
        return;
      }

      const subdomainName = `${delegation.subdomain}.${primaryDomain.name}`;

      // Custom resource to query the target account for hosted zone details
      const delegationQuery = new CustomResource(this, `DelegationQuery${index}`, {
        serviceToken: delegationProvider.serviceToken,
        properties: {
          TargetAccount: delegation.targetAccount,
          SubdomainName: subdomainName,
          RoleName: 'CrossAccount-Deployment',
          // Force update when delegation config changes
          ConfigHash: JSON.stringify(delegation),
        },
      });

      // Create NS record for delegation
      const nsRecord = new NsRecord(this, `NSRecord${index}`, {
        zone: this.parentHostedZone!,
        recordName: delegation.subdomain,
        values: delegationQuery.getAtt('NameServers').toStringList(),
        comment: `NS record for ${subdomainName} delegation to account ${delegation.targetAccount}`,
      });

      // Apply tags to NS record
      // Note: Tags are applied automatically by the base stack

      // Add dependency
      nsRecord.node.addDependency(delegationQuery);

      // Export delegation details
      new CfnOutput(this, `Delegation${index}Output`, {
        value: `${subdomainName} -> ${delegation.targetAccount}`,
        description: `Domain delegation for ${subdomainName}`,
        exportName: this.naming.exportName(`delegation-${delegation.subdomain}`),
      });
    });
  }

  /**
   * Exports parent hosted zone information for reference by other stacks
   */
  private exportHostedZoneInfo(primaryDomain: any): void {
    new CfnOutput(this, 'ParentHostedZoneId', {
      value: this.parentHostedZone!.hostedZoneId,
      description: `Parent hosted zone ID for ${primaryDomain.name}`,
      exportName: this.naming.exportName('parent-hosted-zone-id'),
    });

    new CfnOutput(this, 'ParentDomainName', {
      value: primaryDomain.name,
      description: 'Parent domain name',
      exportName: this.naming.exportName('parent-domain-name'),
    });
  }
}
