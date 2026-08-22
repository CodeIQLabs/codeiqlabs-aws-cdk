/**
 * Serverless SaaS Pattern Orchestrator
 *
 * Orchestrates infrastructure, edge, and workload stacks for the serverless SaaS pattern.
 * Extracted from ComponentOrchestrator to isolate pattern-specific logic.
 *
 * **Architecture:**
 * - Edge: CloudFront → S3 (webapp/marketing), CloudFront → API Gateway (APIs)
 * - Workload: Lambda, API Gateway, DynamoDB, EventBridge, ECR, S3, Secrets Manager
 *
 * **Triggered by manifest sections:** saasWorkload, saasEdge, infrastructure, domains
 */

import type { CdkApplication } from '../../application/cdk-application';
import type { UnifiedAppConfig } from '@codeiqlabs/aws-utils';
import { OrchestrationError } from '../../application/orchestration/base-orchestrator';
import { ResourceNaming } from '@codeiqlabs/aws-utils';

// Edge stacks
import {
  SubdomainZoneStack,
  ApiGatewayDomainStack,
  WorkloadParamsStack,
  RootDomainStack,
  AcmAndWafStack,
  CloudFrontVpcOriginStack,
  DnsRecordsStack,
  StaticWebAppStack,
  SesEmailForwardingStack,
} from './stacks/edge';

// Workload stacks
import {
  SaasSecretsStack,
  DynamoDBStack,
  EcrRepositoryStack,
  LambdaFunctionStack,
  ApiGatewayStack,
  EventBridgeStack,
  EventHandlerLambdaStack,
  ScheduledJobLambdaStack,
  TrialExpiryStack,
} from './stacks/workload';

/**
 * Context passed from ComponentOrchestrator to pattern orchestrators
 */
export interface OrchestrationContext {
  /** CDK application instance */
  app: CdkApplication;
  /** Parsed manifest configuration */
  config: UnifiedAppConfig;
  /** Environment filter from CDK context (e.g., -c targetEnv=nprd) */
  targetEnvFilter?: string;
  /** Resource naming utility for management account */
  naming: ResourceNaming;
  /** Stack name options for management account */
  mgmtStackNameOptions?: { skipEnvironment: boolean };
  /** Naming configuration */
  company: string;
  project: string;
  owner: string;
  /** Primary deployment environment */
  primaryEnv: { account: string; region: string };
  /** Deployment target details */
  deploymentAccountId: string;
  deploymentRegion: string;
}

/**
 * Serverless SaaS Pattern Orchestrator
 *
 * Creates infrastructure, edge, and workload stacks for the serverless SaaS pattern.
 * This includes SubdomainZone, API Gateway domains, CloudFront distributions,
 * Lambda functions, DynamoDB tables, EventBridge, and S3 static hosting.
 */
export class ServerlessSaasOrchestrator {
  /**
   * Orchestrate all serverless SaaS infrastructure
   */
  orchestrate(context: OrchestrationContext): void {
    this.createInfrastructureStacks(context);
    this.createDomainStacks(context);
    this.createWorkloadStacks(context);
  }

  /**
   * Infrastructure components (customization-aws)
   * Creates SubdomainZone, ApiGatewayDomain, and WorkloadParams stacks for workload accounts
   */
  private createInfrastructureStacks(context: OrchestrationContext): void {
    const { app, config, targetEnvFilter, company, project, owner, deploymentRegion } = context;

    const infrastructureConfig = (config as any).infrastructure;
    const targetEnvNames = infrastructureConfig?.targetEnvironments || [];
    if (!infrastructureConfig || targetEnvNames.length === 0) return;

    const commonParamsConfig = infrastructureConfig.commonParams || {};

    // Get management account ID for common params
    const mgmtEnv = config.environments['mgmt'];
    const managementAccountId = mgmtEnv?.accountId;

    if (!managementAccountId) {
      throw new OrchestrationError(
        'Management account ID is required for infrastructure stacks. Add mgmt environment to environments section with accountId.',
        'infrastructure',
        new Error('Missing management account ID'),
      );
    }

    for (const envName of targetEnvNames) {
      // Skip if environment filter is set and doesn't match
      if (targetEnvFilter && envName !== targetEnvFilter) {
        console.log(
          `[ServerlessSaasOrchestrator] Skipping infrastructure for environment: ${envName}`,
        );
        continue;
      }

      const envConfig = config.environments[envName];
      if (!envConfig) {
        throw new OrchestrationError(
          `Environment '${envName}' not found in environments section`,
          'infrastructure',
          new Error(`Missing environment: ${envName}`),
        );
      }

      const envNaming = new ResourceNaming({
        company,
        project,
        environment: envName,
        region: envConfig.region,
        accountId: envConfig.accountId,
      });

      const stackConfig = {
        project,
        environment: envName,
        region: envConfig.region,
        accountId: envConfig.accountId,
        owner,
        company,
      };

      const envEnv = {
        account: envConfig.accountId,
        region: envConfig.region,
      };

      try {
        // 1. Create Subdomain Zone Stack (Cross-account subdomain delegation)
        // Creates delegated subdomain zones ONLY (e.g., nprd.savvue.com, prod.savvue.com)
        // Uses CrossAccountZoneDelegationRecord to auto-create NS records in parent zone
        const subdomainZoneStack = new SubdomainZoneStack(
          app,
          envNaming.stackName('SubdomainZone'),
          {
            stackConfig,
            config: config as any,
            managementAccountId,
            env: envEnv,
          },
        );

        // 2. Create API Gateway Domain Stack (if saasEdge has originType: apiGateway)
        // Creates ACM certificate, API Gateway DomainName, and A records
        // Does NOT create ApiMapping - that's done by saas-aws ApiGatewayStack
        const saasEdgeConfig = (config as any).saasEdge as any[] | undefined;
        if (saasEdgeConfig) {
          // Find domains that have API distributions with originType: apiGateway
          const apiGatewayDomains = saasEdgeConfig
            .filter((edge: any) =>
              edge.distributions?.some(
                (dist: any) => dist.type === 'api' && dist.originType === 'apiGateway',
              ),
            )
            .map((edge: any) => edge.domain);

          if (apiGatewayDomains.length > 0) {
            const apiGwDomainStack = new ApiGatewayDomainStack(
              app,
              envNaming.stackName('ApiGwDomain'),
              {
                stackConfig,
                brandDomains: apiGatewayDomains,
                subdomainZones: subdomainZoneStack.subdomainZones,
                env: envEnv,
              },
            );
            apiGwDomainStack.addDependency(subdomainZoneStack);
          }
        }

        // 3. Create Workload Params Stack (if commonParams.accountIds is true)
        if (commonParamsConfig.accountIds) {
          // Construct delegation role ARNs for domains with createDelegationRole: true
          const delegationRoleArns: Record<string, string> = {};
          const registeredDomains = (config.domains as any)?.registeredDomains as any[] | undefined;
          if (registeredDomains) {
            for (const domain of registeredDomains) {
              if (domain.createDelegationRole) {
                const roleName = `Route53-Delegation-${domain.name.replace(/\./g, '-')}`;
                delegationRoleArns[domain.name] =
                  `arn:aws:iam::${managementAccountId}:role/${roleName}`;
              }
            }
          }

          new WorkloadParamsStack(app, envNaming.stackName('WorkloadParams'), {
            stackConfig,
            managementAccountId,
            managementRegion: deploymentRegion,
            paramsConfig: {
              accountIds: true,
            },
            delegationRoleArns:
              Object.keys(delegationRoleArns).length > 0 ? delegationRoleArns : undefined,
            env: envEnv,
          });
        }
      } catch (error) {
        throw new OrchestrationError(
          `Failed to create infrastructure stacks for environment ${envName}`,
          'infrastructure',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }

  /**
   * Domain management stacks (management account)
   * Creates RootDomain, AcmAndWaf, CloudFront, and DnsRecords stacks
   */
  private createDomainStacks(context: OrchestrationContext): void {
    const {
      app,
      config,
      naming,
      company,
      project,
      owner,
      deploymentAccountId,
      deploymentRegion,
      primaryEnv,
    } = context;

    const saasEdge = (config as any).saasEdge as any[] | undefined;
    const registeredDomains = (config.domains as any)?.registeredDomains as any[] | undefined;
    const hasDomains =
      (registeredDomains && registeredDomains.length > 0) || (saasEdge && saasEdge.length > 0);

    if (!hasDomains) return;

    const mgmtStackConfig = {
      project,
      environment: 'mgmt',
      region: deploymentRegion,
      accountId: deploymentAccountId,
      owner,
      company,
    };

    // us-east-1 environment for CloudFront resources
    const usEast1Env = {
      account: deploymentAccountId,
      region: 'us-east-1',
    };

    // Get target environments from infrastructure config
    const infrastructureConfig = (config as any).infrastructure;
    const targetEnvNames = infrastructureConfig?.targetEnvironments || [];

    try {
      // 1. RootDomainStack - creates hosted zones
      const rootDomainStack = new RootDomainStack(app, naming.stackName('RootDomain'), {
        stackConfig: mgmtStackConfig,
        config: config as any,
        env: primaryEnv,
      });

      // 2. AcmAndWafStack - creates certificates and WAF ACLs (must be in us-east-1)
      // Only create if we have saasEdge (CloudFront distributions)
      let acmWafStack: AcmAndWafStack | undefined;
      if (saasEdge && saasEdge.length > 0) {
        const acmWafNaming = new ResourceNaming({
          company,
          project,
          environment: 'mgmt',
          region: 'us-east-1',
          accountId: deploymentAccountId,
        });

        acmWafStack = new AcmAndWafStack(app, acmWafNaming.stackName('AcmAndWaf'), {
          stackConfig: { ...mgmtStackConfig, region: 'us-east-1' },
          config: config as any,
          nprdAllowedCidrs: (config.domains as any)?.nprdAllowedCidrsWaf || [],
          env: usEast1Env,
        });
        acmWafStack.addDependency(rootDomainStack);
      }

      // 3. CloudFrontVpcOriginStack - creates CloudFront distributions
      // Uses hybrid DNS delegation architecture: alb.{env}.{brand}.com
      // Origins resolve via NS delegation to workload account zones (no SSM lookups)
      const targetEnvironments = targetEnvNames.length > 0 ? targetEnvNames : ['nprd', 'prod'];

      // Only create CloudFront stack if we have saasEdge and acmWafStack
      if (saasEdge && saasEdge.length > 0 && acmWafStack) {
        const acmWafNaming = new ResourceNaming({
          company,
          project,
          environment: 'mgmt',
          region: 'us-east-1',
          accountId: deploymentAccountId,
        });

        const cloudFrontStack = new CloudFrontVpcOriginStack(
          app,
          acmWafNaming.stackName('CloudFront'),
          {
            stackConfig: { ...mgmtStackConfig, region: 'us-east-1' },
            config: config as any,
            targetEnvironments,
            // Pass WAF Web ACL ARNs for environment-based IP restriction
            prodWebAclArn: acmWafStack.prodWebAclArn,
            nprdWebAclArn: acmWafStack.nprdWebAclArn,
            env: usEast1Env,
          },
        );
        cloudFrontStack.addDependency(acmWafStack);

        // 4. DnsRecordsStack - creates DNS records pointing to CloudFront
        const dnsRecordsStack = new DnsRecordsStack(app, naming.stackName('DnsRecords'), {
          stackConfig: mgmtStackConfig,
          config: config as any,
          targetEnvironments,
          env: primaryEnv,
        });
        dnsRecordsStack.addDependency(cloudFrontStack);
      }

      // 5. SES Email Forwarding Stack — for domains with email forwarding config
      if (registeredDomains) {
        const emailDomains = registeredDomains.filter((d: any) => d.email?.forwarding?.length > 0);
        if (emailDomains.length > 0) {
          const sesNaming = new ResourceNaming({
            company,
            project,
            environment: 'mgmt',
            region: 'us-east-1',
            accountId: deploymentAccountId,
          });

          const sesEmailStack = new SesEmailForwardingStack(app, sesNaming.stackName('SesEmail'), {
            stackConfig: { ...mgmtStackConfig, region: 'us-east-1' },
            emailDomains: emailDomains.map((domain: any) => ({
              domainName: domain.name,
              hostedZoneId: domain.hostedZoneId,
              forwardingRules: domain.email.forwarding,
              additionalApexTxtValues: domain.email.additionalApexTxtValues,
            })),
            env: usEast1Env,
          });
          sesEmailStack.addDependency(rootDomainStack);
        }
      }
    } catch (error) {
      throw new OrchestrationError(
        'Failed to create Domain Management stacks',
        'domains',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Multi-environment workload components
   * Creates Secrets, DynamoDB, ECR, Lambda, API Gateway, EventBridge, S3 stacks per environment
   */
  private createWorkloadStacks(context: OrchestrationContext): void {
    const { app, config, targetEnvFilter, company, project, owner } = context;
    const environments = config.environments!;

    if (!config.environments) return;

    for (const [envName, envConfig] of Object.entries(config.environments)) {
      // Skip if environment filter is set and doesn't match
      if (targetEnvFilter && envName !== targetEnvFilter && envName !== 'mgmt') {
        console.log(
          `[ServerlessSaasOrchestrator] Skipping saasWorkload for environment: ${envName}`,
        );
        continue;
      }

      const envEnv = {
        account: envConfig.accountId,
        region: envConfig.region,
      };

      const envNaming = new ResourceNaming({
        company,
        project,
        environment: envName,
        region: envConfig.region,
        accountId: envConfig.accountId,
      });

      const stackConfig = {
        project,
        environment: envName,
        region: envConfig.region,
        accountId: envConfig.accountId,
        owner,
        company,
      };

      // ======================================================================
      // SAAS WORKLOAD - Convention-over-Configuration
      // If saasWorkload is present, derive all infrastructure from it
      // ======================================================================
      const saasWorkload = (config as any).saasWorkload as any[] | undefined;
      const defaults = (config as any).defaults;

      // Skip management environment for saasWorkload-derived infrastructure
      // saasWorkload infrastructure goes to workload accounts only
      if (saasWorkload && saasWorkload.length > 0 && envName !== 'mgmt') {
        // Derive brands and configuration from saasWorkload
        // Convention-over-configuration: lambdaApi, webappS3, marketingS3 flags

        // Brands with lambdaApi: true (Lambda + API Gateway + DynamoDB)
        const lambdaApiBrands = saasWorkload
          .filter((app: any) => app.lambdaApi === true)
          .map((app: any) => app.name);

        // Brands with webappS3: true (S3 bucket for static webapp hosting)
        const webappS3Brands = saasWorkload
          .filter((app: any) => app.webappS3 === true)
          .map((app: any) => app.name);

        // Brands with marketingS3: true (S3 bucket for marketing site hosting)
        const marketingS3Brands = saasWorkload
          .filter((app: any) => app.marketingS3 === true)
          .map((app: any) => app.name);

        // Brands with eventHandlers: true (EventBridge event handler Lambda functions)
        const eventHandlerBrands = saasWorkload
          .filter((app: any) => app.eventHandlers === true)
          .map((app: any) => app.name);

        // Brands with scheduledJobs array (scheduled background job Lambda functions)
        const scheduledJobBrands = saasWorkload
          .filter((app: any) => app.scheduledJobs && app.scheduledJobs.length > 0)
          .map((app: any) => app.name);

        // Brands with trialExpiryChecker (per-service ECR repo created via
        // customRepositories below — no longer merged into scheduledJobBrands,
        // which would create an unused legacy `{brand}-jobs` repo).
        const trialExpiryEcrBrands = saasWorkload
          .filter((app: any) => app.trialExpiryChecker)
          .map((app: any) => app.name);

        // Brands with any non-marketing services (for DynamoDB/Secrets creation)
        const nonMarketingBrands = saasWorkload
          .filter((app: any) => app.lambdaApi === true)
          .map((app: any) => app.name);

        // Get Lambda defaults from manifest
        const lambdaDefaults = defaults?.lambda;

        // Track stacks for dependencies
        let dynamodbStack: DynamoDBStack | undefined;
        let ecrStack: EcrRepositoryStack | undefined;
        let secretsStack: SaasSecretsStack | undefined;

        // 1. Secrets Stack (for application secrets - no database URLs needed with DynamoDB)
        if (nonMarketingBrands.length > 0) {
          try {
            // Collect which brands need each secret type from manifest
            const oauthBrands = saasWorkload
              .filter((app: any) => app.domain)
              .map((app: any) => app.name);
            const secretTypeToBrands: Record<string, string[]> = {};
            // Shared secret types are not per-brand — just track that they're declared
            const sharedSecretTypeSet = new Set(['auth-secret']);

            for (const app of saasWorkload) {
              const brandSecrets: string[] = app.secrets ?? [];
              for (const secretType of brandSecrets) {
                if (!secretTypeToBrands[secretType]) {
                  secretTypeToBrands[secretType] = [];
                }

                // Shared secrets: just mark as present (no brand expansion)
                if (sharedSecretTypeSet.has(secretType)) {
                  // Presence is enough — shared secrets don't track brands
                  continue;
                }

                // For core + OAuth/SES secrets, create for all brands with domains
                if (
                  app.name === 'core' &&
                  ['google-oauth', 'apple-oauth', 'microsoft-oauth', 'ses-smtp'].includes(
                    secretType,
                  )
                ) {
                  for (const brand of oauthBrands) {
                    if (!secretTypeToBrands[secretType].includes(brand)) {
                      secretTypeToBrands[secretType].push(brand);
                    }
                  }
                } else {
                  if (!secretTypeToBrands[secretType].includes(app.name)) {
                    secretTypeToBrands[secretType].push(app.name);
                  }
                }
              }
            }

            // Build secret items from collected types
            const secretItems: any[] = [];

            // Add shared secrets declared in manifest (prefixed with shared/)
            if (secretTypeToBrands['auth-secret']) {
              secretItems.push({
                key: 'shared/auth-secret',
                description: 'Auth.js secret',
                generated: true,
              });
            }

            // Stripe secrets (3 secrets per brand)
            if (secretTypeToBrands['stripe']?.length) {
              secretItems.push(
                {
                  key: 'stripe-secret-key',
                  description: 'Stripe secret key',
                  perBrand: true,
                  brandsOverride: secretTypeToBrands['stripe'],
                },
                {
                  key: 'stripe-webhook-secret',
                  description: 'Stripe webhook secret',
                  perBrand: true,
                  brandsOverride: secretTypeToBrands['stripe'],
                },
                {
                  key: 'stripe-publishable-key',
                  description: 'Stripe publishable key',
                  perBrand: true,
                  brandsOverride: secretTypeToBrands['stripe'],
                },
              );
            }

            // Google OAuth
            if (secretTypeToBrands['google-oauth']?.length) {
              secretItems.push({
                key: 'google-oauth',
                description: 'Google OAuth client credentials',
                perBrand: true,
                brandsOverride: secretTypeToBrands['google-oauth'],
                jsonFields: ['clientId', 'clientSecret'],
              });
            }

            // Apple OAuth
            if (secretTypeToBrands['apple-oauth']?.length) {
              secretItems.push({
                key: 'apple-oauth',
                description: 'Apple Sign In credentials',
                perBrand: true,
                brandsOverride: secretTypeToBrands['apple-oauth'],
                jsonFields: ['clientId', 'teamId', 'keyId', 'privateKey'],
              });
            }

            // Microsoft OAuth
            if (secretTypeToBrands['microsoft-oauth']?.length) {
              secretItems.push({
                key: 'microsoft-oauth',
                description: 'Microsoft Entra ID OAuth credentials',
                perBrand: true,
                brandsOverride: secretTypeToBrands['microsoft-oauth'],
                jsonFields: ['clientId', 'clientSecret'],
              });
            }

            // Plaid
            if (secretTypeToBrands['plaid']?.length) {
              secretItems.push({
                key: 'plaid',
                description: 'Plaid API credentials',
                perBrand: true,
                brandsOverride: secretTypeToBrands['plaid'],
                jsonFields: ['clientId', 'secret', 'env', 'webhookUrl'],
              });
            }

            // SES SMTP credentials (for contact form emails)
            if (secretTypeToBrands['ses-smtp']?.length) {
              secretItems.push({
                key: 'ses-smtp',
                description: 'SES SMTP credentials for contact form',
                perBrand: true,
                brandsOverride: secretTypeToBrands['ses-smtp'],
                jsonFields: ['host', 'port', 'username', 'password'],
              });
            }

            secretsStack = new SaasSecretsStack(app, envNaming.stackName('Secrets'), {
              stackConfig,
              secretsConfig: {
                recoveryWindowInDays: 7,
                brands: nonMarketingBrands,
                items: secretItems,
                // Provision the Plaid `providerAccessToken` envelope-encryption
                // CMK whenever any brand declares Plaid (P12 / FW-1). Lambda
                // and EventHandler stacks pick this up below.
                plaidTokenKey: (secretTypeToBrands['plaid']?.length ?? 0) > 0,
              },
              env: envEnv,
            });
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create Secrets stack for environment ${envName}`,
              'saasWorkload',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // 2. DynamoDB Stack (for brands with lambdaApi: true)
        if (nonMarketingBrands.length > 0) {
          try {
            const tables = nonMarketingBrands;
            const isProd = envName === 'prod';
            dynamodbStack = new DynamoDBStack(app, envNaming.stackName('DynamoDB'), {
              stackConfig,
              tables,
              pointInTimeRecovery: true,
              deletionProtection: isProd,
              env: envEnv,
            });

            // 2b. Trial Expiry Checker Stack — runs against the declaring
            // brand's own table. (Phase 9: the core workload was consolidated
            // into savvue; auth/subscription entities live in the brand table,
            // and ProductSeedStack was removed with core-api's requireProduct.)
            const trialExpiryBrands = saasWorkload.filter((app) => app.trialExpiryChecker);
            for (const trialBrandApp of trialExpiryBrands) {
              const trialBrandTable = dynamodbStack.tables.get(trialBrandApp.name);
              if (!trialBrandTable) {
                // trialExpiryChecker requires lambdaApi: true on the same
                // brand (the checker reads the brand's Subscription rows).
                throw new OrchestrationError(
                  `trialExpiryChecker on brand '${trialBrandApp.name}' requires lambdaApi: true (no table found)`,
                  'saasWorkload',
                );
              }
              try {
                const trialExpiryStack = new TrialExpiryStack(
                  app,
                  envNaming.stackName('TrialExpiry'),
                  {
                    stackConfig,
                    tableName: trialBrandTable.tableName,
                    tableArn: trialBrandTable.tableArn,
                    // The image stays in the legacy-named per-service repo
                    // `core-trial-expiry-checker` (kept to avoid an ECR
                    // re-seed at cutover; renaming is optional post-cutover
                    // cleanup — see phase9-core-consolidation-cutover.md).
                    ecrServiceName: 'core-trial-expiry-checker',
                    env: envEnv,
                  },
                );
                trialExpiryStack.addDependency(dynamodbStack);
                if (ecrStack) {
                  trialExpiryStack.addDependency(ecrStack);
                }
              } catch (error) {
                throw new OrchestrationError(
                  `Failed to create Trial Expiry stack for environment ${envName}`,
                  'saasWorkload',
                  error instanceof Error ? error : new Error(String(error)),
                );
              }
            }
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create DynamoDB stack for environment ${envName}`,
              'saasWorkload',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // 3. ECR Repository Stack (for Lambda container images)
        //
        // Per-service ECR repos (one repo per Lambda image) — the canonical
        // model after the savvue event-handler split + core trial-expiry rename:
        //   - `savvue-auto-matcher` (was part of `savvue-event-handlers`)
        //   - `savvue-post-sync`    (was part of `savvue-event-handlers`)
        //   - `core-trial-expiry-checker` (was part of `core-jobs`)
        //
        // The legacy shared repos (`{brand}-event-handlers`, `core-jobs`) are
        // still created below via `eventHandlerBrands` / `scheduledJobBrands`
        // for one deploy cycle so any orphaned consumers can keep pulling.
        // Drop those `eventHandlerBrands`/`scheduledJobBrands` props in a
        // follow-up PR once the new repos are confirmed populated by CI and
        // no Lambda still references the legacy ones.
        const customRepositories: Array<{ brand: string; serviceName: string }> = [];
        const handlerEcrRepositories: Record<string, string> = {};
        // Phase 9 decoupling: the per-service event-handler ECR split
        // (savvue-auto-matcher / savvue-post-sync repos + handler repointing) is
        // a SEPARATE, still-incomplete effort — the new repos have no images and
        // the local Docker packaging (pnpm install --prod in deploy-lambda.sh)
        // for the handlers is unfinished. Leaving handlerEcrRepositories empty
        // makes EventHandlerLambdaStack fall back to the working shared
        // `savvue-event-handlers` repo (which the live auto-matcher/post-sync
        // Lambdas already run), so the core->savvue consolidation can deploy
        // without dragging in that unrelated WIP. Restore the two
        // customRepositories.push(...) + handlerEcrRepositories[...] lines once
        // the event-handler split (images + Dockerfile packaging) is ready.
        if (trialExpiryEcrBrands.length > 0) {
          // Phase 9: the trial-expiry workload moved under `savvue`, but the
          // image keeps its legacy-named repo (`core-trial-expiry-checker`)
          // to avoid an ECR re-seed at cutover (deploy.yml's SSM lookup uses
          // BRAND: core for the same reason). Renaming is optional
          // post-cutover cleanup.
          customRepositories.push({ brand: 'core', serviceName: 'trial-expiry-checker' });
        }

        if (
          lambdaApiBrands.length > 0 ||
          eventHandlerBrands.length > 0 ||
          scheduledJobBrands.length > 0 ||
          customRepositories.length > 0
        ) {
          try {
            ecrStack = new EcrRepositoryStack(app, envNaming.stackName('ECR'), {
              stackConfig,
              repositoryConfig: {
                webappBrands: [],
                apiBrands: lambdaApiBrands,
                eventHandlerBrands: eventHandlerBrands.length > 0 ? eventHandlerBrands : undefined,
                scheduledJobBrands: scheduledJobBrands.length > 0 ? scheduledJobBrands : undefined,
                customRepositories: customRepositories.length > 0 ? customRepositories : undefined,
              },
              env: envEnv,
            });
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create ECR stack for environment ${envName}`,
              'saasWorkload',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // 4. Lambda Function Stack (Lambda + API Gateway + DynamoDB)
        if (lambdaApiBrands.length > 0 && dynamodbStack) {
          try {
            // Build Lambda function configs from lambdaApiBrands
            const lambdaFunctions = lambdaApiBrands.map((brand) => {
              const environment: Record<string, string> = {};

              // Inject API base URL for inter-service calls (e.g. savvue-api → core-api).
              // Uses the brand's own domain since all brand APIs share the API Gateway.
              const ownBrandConfig = saasWorkload.find((app: any) => app.name === brand);
              const ownDomain = ownBrandConfig?.domain as string | undefined;
              if (ownDomain) {
                environment.API_BASE_URL =
                  envName === 'prod'
                    ? `https://api.${ownDomain}`
                    : `https://${envName}-api.${ownDomain}`;
              }

              // Brand table name + Plaid secret prefix — read by the brand
              // API's Stripe webhook (customer.deleted unwind → Plaid revoke
              // via the shared disconnectUserConnections helper) as
              // BRAND_TABLE_{BRAND_UPPER} and PLAID_SECRET_PREFIX. (Phase 9:
              // formerly injected only into core-api; the webhook now lives
              // in the brand API.)
              const ownBrandTable = dynamodbStack!.tables.get(brand);
              if (ownBrandTable) {
                environment[`BRAND_TABLE_${brand.toUpperCase()}`] = ownBrandTable.tableName;
              }
              environment.PLAID_SECRET_PREFIX = `${stackConfig.project}/${envName}`;

              if (ownBrandConfig?.stripe?.[envName]) {
                const stripeConfig = ownBrandConfig.stripe[envName];
                const brandUpper = brand.toUpperCase();
                if (stripeConfig.priceIdMonthly) {
                  environment[`STRIPE_PRICE_ID_MONTHLY_${brandUpper}`] =
                    stripeConfig.priceIdMonthly;
                }
                if (stripeConfig.priceIdAnnual) {
                  environment[`STRIPE_PRICE_ID_ANNUAL_${brandUpper}`] = stripeConfig.priceIdAnnual;
                }
                if (stripeConfig.priceIdExtraConnectionMonthly) {
                  environment[`STRIPE_PRICE_ID_EXTRA_CONNECTION_MONTHLY_${brandUpper}`] =
                    stripeConfig.priceIdExtraConnectionMonthly;
                }
                if (stripeConfig.priceIdExtraConnectionAnnual) {
                  environment[`STRIPE_PRICE_ID_EXTRA_CONNECTION_ANNUAL_${brandUpper}`] =
                    stripeConfig.priceIdExtraConnectionAnnual;
                }
              }

              // Per-brand alarm wiring. Each alarm fires only when the brand
              // declares its `opsEmail` in the manifest under `alarms.<name>`:
              //   - orphanPlaidItem  (Gap-11) — savvue-api Plaid /item/remove
              //   - unknownPriceId   (PX.1)   — core-api Stripe price-mapping
              const brandAlarms = (saasWorkload.find((app: any) => app.name === brand) as any)
                ?.alarms;
              const orphanPlaidItemAlarm = brandAlarms?.orphanPlaidItem?.opsEmail
                ? { opsEmail: brandAlarms.orphanPlaidItem.opsEmail as string }
                : undefined;
              const unknownPriceIdAlarm = brandAlarms?.unknownPriceId?.opsEmail
                ? { opsEmail: brandAlarms.unknownPriceId.opsEmail as string }
                : undefined;

              return {
                // Lambda function name pattern: `{brand}-api` (canonical, matches
                // ECR repo and saas-ui Nx project IDs). Deployed as
                // `saas-{env}-{brand}-api` (e.g. `saas-nprd-savvue-api`).
                name: `${brand}-api`,
                ecrRepositoryName: `${brand}-api`,
                memorySize: lambdaDefaults?.memorySize ?? 1024,
                timeout: lambdaDefaults?.timeout ?? 30,
                environment: Object.keys(environment).length > 0 ? environment : undefined,
                orphanPlaidItemAlarm,
                unknownPriceIdAlarm,
              };
            });

            // Resolve EventBridge bus name with environment placeholder
            const eventBridgeBusName = lambdaDefaults?.eventBridgeBusName
              ? (lambdaDefaults.eventBridgeBusName as string).replace('{env}', envName)
              : undefined;

            const lambdaStack = new LambdaFunctionStack(app, envNaming.stackName('Lambda'), {
              stackConfig,
              config: {
                functions: lambdaFunctions,
                eventBridgeBusName,
              },
              dynamodbTables: dynamodbStack.tables,
              plaidTokenKey: secretsStack?.plaidTokenKey,
              env: envEnv,
            });
            lambdaStack.addDependency(dynamodbStack);
            if (ecrStack) {
              lambdaStack.addDependency(ecrStack);
            }
            if (secretsStack?.plaidTokenKey) {
              lambdaStack.addDependency(secretsStack);
            }

            // 7b. API Gateway Stack (HTTP API with routes to Lambda functions)
            try {
              const apiRoutes = lambdaApiBrands.map((brand) => ({
                path: `/${brand}/{proxy+}`,
                // Must match the Lambda `fnConfig.name` set above so the API
                // Gateway integration can look it up in `lambdaStack.functions`.
                lambdaName: `${brand}-api`,
              }));

              // Derive CORS origins from brands with domains
              const domainsWithWebapps = saasWorkload
                .filter((app: any) => app.domain)
                .map((app: any) => app.domain as string);

              const corsOrigins: string[] = [];
              for (const domain of domainsWithWebapps) {
                corsOrigins.push(`https://app.${domain}`);
                if (envName !== 'prod') {
                  corsOrigins.push(`https://${envName}-app.${domain}`);
                }
              }

              // Get brand domains that have lambdaApi: true for API mappings
              const apiMappingDomains = saasWorkload
                .filter((app: any) => app.lambdaApi === true && app.domain)
                .map((app: any) => app.domain);

              const apiGatewayStack = new ApiGatewayStack(app, envNaming.stackName('ApiGateway'), {
                stackConfig,
                config: {
                  routes: apiRoutes,
                  corsOrigins: corsOrigins.length > 0 ? corsOrigins : undefined,
                },
                lambdaFunctions: lambdaStack.functions,
                apiMappingDomains: apiMappingDomains.length > 0 ? apiMappingDomains : undefined,
                env: envEnv,
              });
              apiGatewayStack.addDependency(lambdaStack);

              // 7c. Event Handler Lambda Stack
              let eventHandlerStack: EventHandlerLambdaStack | undefined;
              if (eventHandlerBrands.length > 0 && dynamodbStack && ecrStack) {
                try {
                  const eventBridgeBusNameForHandlers = lambdaDefaults?.eventBridgeBusName
                    ? (lambdaDefaults.eventBridgeBusName as string).replace('{env}', envName)
                    : undefined;

                  // Per-brand extras for event handlers. Mirrors the
                  // `PLAID_SECRET_PREFIX` convention used by savvue-api (see
                  // the lambdaFunctions map above) so post-sync-handler-savvue
                  // can resolve Plaid credentials at runtime when calling the
                  // shared sync services.
                  const handlers = eventHandlerBrands.map((brand) => ({
                    brand,
                    memorySize: lambdaDefaults?.memorySize ?? 1024,
                    timeout: lambdaDefaults?.timeout ?? 30,
                    extraEnvironment: {
                      PLAID_SECRET_PREFIX: `${stackConfig.project}/${envName}`,
                    },
                  }));

                  eventHandlerStack = new EventHandlerLambdaStack(
                    app,
                    envNaming.stackName('EventHandlerLambda'),
                    {
                      stackConfig,
                      handlers,
                      dynamodbTables: dynamodbStack.tables,
                      eventBridgeBusName: eventBridgeBusNameForHandlers,
                      plaidTokenKey: secretsStack?.plaidTokenKey,
                      // Cutover: each handler imports its own per-service ECR
                      // repo (savvue-auto-matcher, savvue-post-sync) instead
                      // of the legacy shared `savvue-event-handlers` repo.
                      // Built above alongside `customRepositories`.
                      handlerEcrRepositories:
                        Object.keys(handlerEcrRepositories).length > 0
                          ? handlerEcrRepositories
                          : undefined,
                      env: envEnv,
                    },
                  );

                  eventHandlerStack.addDependency(dynamodbStack);
                  eventHandlerStack.addDependency(ecrStack);
                  if (secretsStack?.plaidTokenKey) {
                    eventHandlerStack.addDependency(secretsStack);
                  }
                } catch (error) {
                  throw new OrchestrationError(
                    `Failed to create Event Handler Lambda stack for environment ${envName}`,
                    'saasWorkload',
                    error instanceof Error ? error : new Error(String(error)),
                  );
                }
              }

              // 7d. EventBridge Stack (event bus for async communication)
              try {
                const eventBridgeStack = new EventBridgeStack(
                  app,
                  envNaming.stackName('EventBridge'),
                  {
                    stackConfig,
                    config: {
                      eventRules: [],
                      dlqRetentionDays: 14,
                      publisherBrands: [...lambdaApiBrands, ...webappS3Brands],
                      eventHandlerBrands:
                        eventHandlerBrands.length > 0 ? eventHandlerBrands : undefined,
                    },
                    env: envEnv,
                  },
                );

                // EventBridge stack imports Lambda functions from SSM (not construct refs)
                // so we only need a deploy-time dependency to ensure SSM params exist first
                if (eventHandlerStack) {
                  eventBridgeStack.addDependency(eventHandlerStack);
                }
              } catch (error) {
                throw new OrchestrationError(
                  `Failed to create EventBridge stack for environment ${envName}`,
                  'saasWorkload',
                  error instanceof Error ? error : new Error(String(error)),
                );
              }

              // 7e. Scheduled Job Lambda Stack (for background jobs)
              if (scheduledJobBrands.length > 0 && dynamodbStack && ecrStack) {
                const eventBridgeBusNameForJobs = lambdaDefaults?.eventBridgeBusName
                  ? (lambdaDefaults.eventBridgeBusName as string).replace('{env}', envName)
                  : undefined;

                const coreTable = dynamodbStack.tables.get('core');

                for (const brand of scheduledJobBrands) {
                  try {
                    const brandConfig = saasWorkload.find((app: any) => app.name === brand);
                    const jobConfigs = brandConfig?.scheduledJobs || [];

                    if (jobConfigs.length === 0) continue;

                    const brandTable = dynamodbStack.tables.get(brand);
                    if (!brandTable) {
                      throw new Error(`DynamoDB table for brand '${brand}' not found`);
                    }

                    const scheduledJobStack = new ScheduledJobLambdaStack(
                      app,
                      envNaming.stackName(
                        `ScheduledJobs-${brand.charAt(0).toUpperCase() + brand.slice(1)}`,
                      ),
                      {
                        stackConfig,
                        brand,
                        jobs: jobConfigs.map((job: any) => ({
                          name: job.name,
                          description: job.description,
                          schedule: job.schedule,
                          memorySize: job.memorySize ?? lambdaDefaults?.memorySize ?? 1024,
                          timeout: job.timeout ?? 300,
                          enabled: job.enabled !== false,
                        })),
                        dynamodbTable: brandTable,
                        coreTable,
                        eventBridgeBusName: eventBridgeBusNameForJobs,
                        env: envEnv,
                      },
                    );

                    scheduledJobStack.addDependency(dynamodbStack);
                    scheduledJobStack.addDependency(ecrStack);
                  } catch (error) {
                    throw new OrchestrationError(
                      `Failed to create Scheduled Job Lambda stack for brand ${brand} in environment ${envName}`,
                      'saasWorkload',
                      error instanceof Error ? error : new Error(String(error)),
                    );
                  }
                }
              }
            } catch (error) {
              throw new OrchestrationError(
                `Failed to create API Gateway stack for environment ${envName}`,
                'saasWorkload',
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create Lambda stack for environment ${envName}`,
              'saasWorkload',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // 8. Static Hosting Stack (S3 buckets for webapp and marketing sites)
        if (webappS3Brands.length > 0 || marketingS3Brands.length > 0) {
          try {
            const brandBuckets: Array<{ brand: string; type: 'webapp' | 'marketing' }> = [
              ...webappS3Brands.map((brand) => ({ brand, type: 'webapp' as const })),
              ...marketingS3Brands.map((brand) => ({ brand, type: 'marketing' as const })),
            ];

            const mgmtEnv = environments['mgmt'];
            const managementAccountId = mgmtEnv?.accountId;

            new StaticWebAppStack(app, envNaming.stackName('StaticHosting'), {
              stackConfig,
              siteConfig: {
                brandBuckets,
                managementAccountId,
                enableVersioning: true,
              },
              env: envEnv,
            });
          } catch (error) {
            throw new OrchestrationError(
              `Failed to create Static Hosting stack for environment ${envName}`,
              'saasWorkload',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }

        // Skip explicit component processing for this environment
        // since we've derived everything from saasEdge/saasWorkload
        continue;
      }
    }
  }
}
