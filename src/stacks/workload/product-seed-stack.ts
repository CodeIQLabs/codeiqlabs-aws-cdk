import { Construct } from 'constructs';
import { CustomResource, Duration } from 'aws-cdk-lib';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { BaseStack, type BaseStackProps } from '../base/base-stack';

/**
 * Product Seed Stack Props
 */
export interface ProductSeedStackProps extends BaseStackProps {
  /**
   * List of product/brand names to seed
   * Derived from saasWorkload in manifest (excluding 'core')
   */
  products: Array<{
    id: string;
    name: string;
    description?: string;
  }>;

  /**
   * The core DynamoDB table to seed products into
   */
  coreTable: Table;
}

/**
 * Product Seed Stack
 *
 * Creates a custom resource that seeds product entities into DynamoDB
 * during CDK deployment. Products are only created if they don't exist.
 *
 * This runs once per deployment (Create/Update), not on every Lambda cold start.
 * Products are derived from the saasWorkload array in manifest.yaml.
 *
 * @example
 * ```typescript
 * new ProductSeedStack(app, 'ProductSeed', {
 *   stackConfig,
 *   products: [
 *     { id: 'savvue', name: 'Savvue', description: 'Household income clarity' },
 *     { id: 'equitrio', name: 'Equitrio', description: 'Portfolio tracking' },
 *   ],
 *   coreTable: dynamodbStack.tables.get('core')!,
 *   env: envEnv,
 * });
 * ```
 */
export class ProductSeedStack extends BaseStack {
  constructor(scope: Construct, id: string, props: ProductSeedStackProps) {
    super(scope, id, 'ProductSeed', props);

    const { products, coreTable } = props;

    if (products.length === 0) {
      return; // Nothing to seed
    }

    // Create Lambda function for seeding products
    const seedFunction = this.createSeedFunction(coreTable.tableName);

    // Grant DynamoDB permissions
    coreTable.grantReadWriteData(seedFunction);

    // Create custom resource provider
    const seedProvider = new Provider(this, 'SeedProvider', {
      onEventHandler: seedFunction,
    });

    // Create custom resource that triggers seeding
    // The custom resource runs on CREATE and UPDATE (when properties change)
    // ProductsHash changes when products are added/removed
    // SeedVersion can be manually incremented to force re-seeding if products were deleted
    new CustomResource(this, 'ProductSeed', {
      serviceToken: seedProvider.serviceToken,
      properties: {
        Products: JSON.stringify(products),
        TableName: coreTable.tableName,
        // Force update when products change
        ProductsHash: JSON.stringify(products.map((p) => p.id).sort()),
        // Increment this version to force re-seeding (e.g., if products were manually deleted)
        SeedVersion: '2',
      },
    });
  }

  /**
   * Creates the Lambda function that seeds products into DynamoDB
   */
  private createSeedFunction(tableName: string): Function {
    return new Function(this, 'SeedFunction', {
      runtime: Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: Duration.minutes(1),
      description: 'Seeds product entities into DynamoDB during deployment',
      environment: {
        TABLE_NAME: tableName,
      },
      code: Code.fromInline(`
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const { RequestType, ResourceProperties } = event;
  const { Products, TableName } = ResourceProperties;
  
  // Only seed on Create or Update
  if (RequestType === 'Delete') {
    console.log('Delete request - no action needed');
    return { PhysicalResourceId: 'product-seed' };
  }
  
  const products = JSON.parse(Products);
  console.log('Seeding products:', products.map(p => p.id));
  
  const results = { created: [], skipped: [], errors: [] };
  
  for (const product of products) {
    try {
      // Check if product exists using ElectroDB key pattern
      // ProductEntity uses: PK = "PRODUCT#<id>", SK = "METADATA"
      const existing = await docClient.send(new GetCommand({
        TableName,
        Key: {
          PK: 'PRODUCT#' + product.id,
          SK: 'METADATA',
        },
      }));

      if (existing.Item) {
        console.log('Product already exists:', product.id);
        results.skipped.push(product.id);
        continue;
      }

      // Create product using ElectroDB entity structure
      const now = new Date().toISOString();
      await docClient.send(new PutCommand({
        TableName,
        Item: {
          PK: 'PRODUCT#' + product.id,
          SK: 'METADATA',
          id: product.id,
          name: product.name,
          description: product.description || product.name + ' platform',
          createdAt: now,
          updatedAt: now,
          __edb_e__: 'Product',
          __edb_v__: '1',
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }));
      
      console.log('Created product:', product.id);
      results.created.push(product.id);
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        // Race condition - product was created between check and put
        console.log('Product created by another process:', product.id);
        results.skipped.push(product.id);
      } else {
        console.error('Error seeding product:', product.id, error);
        results.errors.push({ id: product.id, error: error.message });
      }
    }
  }
  
  console.log('Seed results:', results);
  
  return {
    PhysicalResourceId: 'product-seed',
    Data: {
      Created: results.created.join(','),
      Skipped: results.skipped.join(','),
      Errors: results.errors.length > 0 ? JSON.stringify(results.errors) : '',
    },
  };
};
      `),
    });
  }
}
