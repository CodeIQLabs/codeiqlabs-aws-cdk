---
inclusion: fileMatch
fileMatchPattern: 'src/stacks/**/*'
---

# CDK Stacks Guidelines

## Overview

Stacks are the deployment units in CDK. Each stack represents a CloudFormation stack.

## Stack Organization

- `src/stacks/base/` - Base stack classes (extended by all stacks)
- `src/stacks/organizations/` - Management account stacks (Organizations)
- `src/stacks/identity-center/` - Management account stacks (SSO)
- `src/stacks/customization/` - Shared customization stacks (GitHub OIDC)
- `src/patterns/serverless-saas/stacks/edge/` - Edge infrastructure (CloudFront, DNS, certificates)
- `src/patterns/serverless-saas/stacks/workload/` - Workload infrastructure (Lambda, DynamoDB, S3)

## Stack Naming Convention

Stacks follow this pattern:

```
{Company}-{Project}-{Environment}-{Stack}-Stack
```

Examples:

- `CodeIQLabs-SaaS-NonProd-Lambda-Savvue-Stack`
- `CodeIQLabs-Management-Organizations-Stack`

Use `@codeiqlabs/aws-utils` for consistent naming:

```typescript
import { generateStackName } from '@codeiqlabs/aws-utils';

const stackName = generateStackName({
  company: 'CodeIQLabs',
  project: 'SaaS',
  environment: 'nprd',
  stackName: 'Lambda-Savvue',
});
```

## Stack Template

```typescript
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface MyStackProps extends StackProps {
  readonly environment: 'nprd' | 'prod';
  readonly config: MyConfig;
}

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: MyStackProps) {
    super(scope, id, props);

    // Validation
    if (!props.config) {
      throw new Error('config is required');
    }

    // Resource creation using constructs
    const myConstruct = new MyConstruct(this, 'MyConstruct', {
      environment: props.environment,
      // ...
    });

    // Outputs
    new cdk.CfnOutput(this, 'ResourceArn', {
      value: myConstruct.resourceArn,
      exportName: `${id}-ResourceArn`,
    });
  }
}
```

## Cross-Stack References

### Exporting Values

```typescript
new cdk.CfnOutput(this, 'BucketName', {
  value: bucket.bucketName,
  exportName: 'SaaS-NonProd-WebappBucket',
});
```

### Importing Values

```typescript
const bucketName = cdk.Fn.importValue('SaaS-NonProd-WebappBucket');
```

### Using SSM Parameters (Preferred)

```typescript
// Export to SSM
new ssm.StringParameter(this, 'BucketNameParam', {
  parameterName: '/saas/nprd/webapp-bucket-name',
  stringValue: bucket.bucketName,
});

// Import from SSM
const bucketName = ssm.StringParameter.valueFromLookup(this, '/saas/nprd/webapp-bucket-name');
```

## Stack Dependencies

CDK automatically handles dependencies when you reference resources:

```typescript
// Stack A
export class StackA extends Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    this.bucket = new s3.Bucket(this, 'Bucket');
  }
}

// Stack B (depends on Stack A)
export class StackB extends Stack {
  constructor(scope: Construct, id: string, props: StackBProps) {
    super(scope, id, props);

    // This creates an implicit dependency
    const bucketName = props.stackA.bucket.bucketName;
  }
}

// App
const stackA = new StackA(app, 'StackA');
const stackB = new StackB(app, 'StackB', { stackA });
```

## Environment Configuration

### Using Environment Props

```typescript
const stack = new MyStack(app, 'MyStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
```

### Cross-Account Stacks

```typescript
const managementStack = new ManagementStack(app, 'ManagementStack', {
  env: {
    account: '682475224767',
    region: 'us-east-1',
  },
});

const workloadStack = new WorkloadStack(app, 'WorkloadStack', {
  env: {
    account: '466279485605',
    region: 'us-east-1',
  },
});
```

## Stack Outputs

### CloudFormation Outputs

```typescript
new cdk.CfnOutput(this, 'ApiUrl', {
  value: api.url,
  description: 'API Gateway URL',
  exportName: 'SaaS-NonProd-ApiUrl',
});
```

### SSM Parameter Outputs (Preferred for Cross-Account)

```typescript
new ssm.StringParameter(this, 'ApiUrlParam', {
  parameterName: '/saas/nprd/api-url',
  stringValue: api.url,
  description: 'API Gateway URL',
});
```

## Testing Stacks

### Snapshot Tests

```typescript
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MyStack } from '../src/stacks/my-stack';

test('MyStack snapshot', () => {
  const app = new App();
  const stack = new MyStack(app, 'MyStack', {
    environment: 'nprd',
    config: {
      /* ... */
    },
  });

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
```

### Fine-Grained Assertions

```typescript
test('MyStack creates Lambda function', () => {
  const app = new App();
  const stack = new MyStack(app, 'MyStack', {
    environment: 'nprd',
    config: {
      /* ... */
    },
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs18.x',
    MemorySize: 1024,
  });
});
```

## Breaking Cross-Stack Export Dependencies

When refactoring stacks to remove cross-stack references (e.g., switching from construct references
to SSM lookups), CloudFormation will reject the update because the old export is still in use.

**Fix: Deploy the exporting stack first with `--exclusively`**

```bash
# Step 1: Deploy the stack that EXPORTS the value (removes the export)
npx cdk deploy "CodeIQLabs-SaaS-NonProd-EventBridge-Stack" --exclusively \
  -c targetEnv=nprd --profile codeiqlabs-saas-admin-nprd

# Step 2: Deploy the stack that IMPORTS the value (now safe to update)
npx cdk deploy "CodeIQLabs-SaaS-NonProd-EventHandlerLambda-Stack" --exclusively \
  -c targetEnv=nprd --profile codeiqlabs-saas-admin-nprd
```

The `--exclusively` flag prevents CDK from deploying dependencies, which would otherwise deploy the
importing stack first and fail.

**When to use this pattern:**

- Replacing cross-stack construct references with SSM `valueForStringParameter`
- Removing a stack that other stacks reference
- Refactoring stack boundaries

## Avoiding Cyclic Dependencies Between Stacks

Cross-stack construct references (passing Lambda functions, queues, etc. between stacks) create
implicit CloudFormation exports/imports. If Stack A references Stack B and Stack B references Stack
A, you get a cyclic dependency.

**Solution: Use SSM parameters instead of construct references**

```typescript
// In LambdaStack: write Lambda ARN to SSM
new ssm.StringParameter(this, 'LambdaArnParam', {
  parameterName: this.naming.ssmParameterName('lambda', handlerName, 'arn'),
  stringValue: lambdaFn.functionArn,
});

// In EventBridgeStack: read Lambda ARN from SSM (no cross-stack dependency)
const lambdaArn = ssm.StringParameter.valueForStringParameter(
  this,
  this.naming.ssmParameterName('lambda', handlerName, 'arn'),
);
const lambdaFn = lambda.Function.fromFunctionArn(this, 'ImportedLambda', lambdaArn);
```

This breaks the cyclic dependency because SSM lookups are resolved at deploy time without
CloudFormation exports.

## Anti-Patterns

- ❌ Don't create stacks without environment props
- ❌ Don't hardcode account IDs - use environment variables
- ❌ Don't create circular dependencies between stacks — use SSM parameters instead
- ❌ Don't use CloudFormation exports for cross-account - use SSM
- ❌ Don't create too many resources in one stack - split into multiple stacks
- ❌ Don't forget to add stack descriptions
- ❌ Don't skip validation in constructor
- ❌ Don't pass construct references between stacks that reference each other — use SSM lookups
