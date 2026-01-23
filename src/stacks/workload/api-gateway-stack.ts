/**
 * API Gateway Stack for Workload Infrastructure
 *
 * Creates HTTP API Gateway with routes to Lambda functions.
 * Uses HTTP API (not REST API) for 70% cost savings and lower latency.
 *
 * Architecture:
 * - HTTP API with CORS configuration
 * - Routes: /core/*, /savvue/*, /equitrio/*, /webhook/*
 * - Custom domain with ACM certificate
 * - SSM parameters for CloudFront integration
 *
 * @example
 * ```typescript
 * new ApiGatewayStack(app, 'ApiGateway', {
 *   stackConfig: {
 *     project: 'SaaS',
 *     environment: 'nprd',
 *     region: 'us-east-1',
 *     accountId: '466279485605',
 *     owner: 'CodeIQLabs',
 *     company: 'CodeIQLabs',
 *   },
 *   config: {
 *     routes: [
 *       { path: '/core/{proxy+}', lambdaName: 'api-core' },
 *       { path: '/savvue/{proxy+}', lambdaName: 'api-savvue' },
 *     ],
 *     corsOrigins: ['https://app.savvue.com'],
 *   },
 * });
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base';

/**
 * API route configuration
 */
export interface ApiRouteConfig {
  /**
   * Route path (e.g., '/core/{proxy+}', '/webhook/plaid')
   */
  path: string;

  /**
   * Lambda function name (e.g., 'api-core', 'api-savvue')
   * Will be resolved to full function name: saas-{env}-{lambdaName}
   */
  lambdaName: string;

  /**
   * HTTP methods to allow
   * @default ['ANY']
   */
  methods?: apigatewayv2.HttpMethod[];
}

/**
 * API Gateway stack configuration
 */
export interface ApiGatewayConfig {
  /**
   * API routes to create
   */
  routes: ApiRouteConfig[];

  /**
   * CORS allowed origins
   * @default ['*']
   */
  corsOrigins?: string[];

  /**
   * CORS allowed headers
   * @default ['Authorization', 'Content-Type', 'X-Request-Id']
   */
  corsHeaders?: string[];
}

export interface ApiGatewayStackProps extends BaseStackProps {
  /**
   * API Gateway configuration
   */
  config: ApiGatewayConfig;

  /**
   * Map of Lambda functions by name
   * If not provided, functions will be imported from SSM
   */
  lambdaFunctions?: Map<string, lambda.IFunction>;

  /**
   * Brand domains that need API mappings (e.g., ['savvue.com', 'equitrio.com'])
   * The DomainName is looked up from SSM (created by customization-aws ApiGatewayDomainStack)
   * @default [] - no API mappings created
   */
  apiMappingDomains?: string[];
}

/**
 * API Gateway Stack for HTTP API
 *
 * Creates HTTP API with routes to Lambda functions.
 */
export class ApiGatewayStack extends BaseStack {
  public readonly httpApi: apigatewayv2.HttpApi;
  public readonly apiEndpoint: string;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, 'ApiGateway', props);

    const { config, lambdaFunctions } = props;
    const stackConfig = this.getStackConfig();
    const envName = stackConfig.environment;

    // Create HTTP API with CORS
    // Note: allowCredentials is only valid with explicit origins, not '*'
    // Note: When allowCredentials is true, allowMethods cannot be '*' - must be explicit
    const hasExplicitOrigins = config.corsOrigins && config.corsOrigins.length > 0;
    this.httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: this.naming.resourceName('api'),
      description: `HTTP API for ${stackConfig.project} ${envName}`,
      corsPreflight: {
        allowOrigins: hasExplicitOrigins ? config.corsOrigins : ['*'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.PATCH,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: config.corsHeaders ?? [
          'Authorization',
          'Content-Type',
          'X-Request-Id',
          'X-User-Id',
          'X-User-Email',
          'X-Product-ID',
        ],
        allowCredentials: hasExplicitOrigins, // Only enable with explicit origins
        maxAge: cdk.Duration.hours(1),
      },
    });

    this.apiEndpoint = this.httpApi.apiEndpoint;

    // Create routes for each Lambda function
    for (const route of config.routes) {
      // Get or import Lambda function
      let lambdaFn: lambda.IFunction;

      if (lambdaFunctions?.has(route.lambdaName)) {
        lambdaFn = lambdaFunctions.get(route.lambdaName)!;
      } else {
        // Import Lambda function ARN from SSM
        const lambdaArn = ssm.StringParameter.valueFromLookup(
          this,
          this.naming.ssmParameterName('lambda', `${route.lambdaName}-arn`),
        );
        lambdaFn = lambda.Function.fromFunctionArn(this, `${route.lambdaName}Function`, lambdaArn);
      }

      // Create Lambda integration
      const integration = new integrations.HttpLambdaIntegration(
        `${route.lambdaName}Integration`,
        lambdaFn,
      );

      // Add route to HTTP API
      const methods = route.methods ?? [apigatewayv2.HttpMethod.ANY];
      this.httpApi.addRoutes({
        path: route.path,
        methods,
        integration,
      });
    }

    // Store API Gateway endpoint in SSM
    new ssm.StringParameter(this, 'ApiEndpointParameter', {
      parameterName: this.naming.ssmParameterName('api-gateway', 'endpoint'),
      stringValue: this.httpApi.apiEndpoint,
      description: 'HTTP API Gateway endpoint URL',
    });

    new ssm.StringParameter(this, 'ApiIdParameter', {
      parameterName: this.naming.ssmParameterName('api-gateway', 'id'),
      stringValue: this.httpApi.apiId,
      description: 'HTTP API Gateway ID',
    });

    // Output API endpoint
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.httpApi.apiEndpoint,
      exportName: this.naming.exportName('api-gateway-endpoint'),
      description: 'HTTP API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.httpApi.apiId,
      exportName: this.naming.exportName('api-gateway-id'),
      description: 'HTTP API Gateway ID',
    });

    // Create API mappings for custom domains (if any)
    // The DomainName is created by customization-aws ApiGatewayDomainStack
    // We construct the domain name directly using the known pattern: api-gw.{env}.{domain}
    // Note: We use CfnApiMapping (L1) because DomainName.fromDomainNameAttributes() doesn't
    // properly expose the name property for CloudFormation synthesis
    if (props.apiMappingDomains && props.apiMappingDomains.length > 0) {
      for (const domain of props.apiMappingDomains) {
        const sanitizedDomain = this.sanitizeDomainName(domain);

        // Construct the domain name using the known pattern
        // This matches what customization-aws creates in ApiGatewayDomainStack
        const domainNameValue = `api-gw.${envName}.${domain}`;

        // Create API mapping using L1 construct to properly reference the domain name
        // The L2 ApiMapping construct doesn't work with imported DomainName
        new apigatewayv2.CfnApiMapping(this, `ApiMapping${sanitizedDomain}`, {
          apiId: this.httpApi.apiId,
          domainName: domainNameValue,
          stage: '$default',
        });

        new cdk.CfnOutput(this, `ApiMapping${sanitizedDomain}Output`, {
          value: domainNameValue,
          description: `API Gateway custom domain mapping for ${domain}`,
        });
      }
    }
  }

  private sanitizeDomainName(domainName: string): string {
    return domainName
      .split('.')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
