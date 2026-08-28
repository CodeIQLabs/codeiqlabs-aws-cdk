---
inclusion: fileMatch
fileMatchPattern: 'src/constructs/**/*'
---

# CDK Constructs Guidelines

## Overview

This directory contains reusable CDK constructs (L3 constructs) that encapsulate common
infrastructure patterns.

## Construct Organization

Constructs are organized by AWS service or pattern:

- `src/constructs/` - Reusable L3 constructs
- `src/stacks/` - Stack definitions that use constructs
- `src/stages/` - CDK Pipeline stages
- `src/application/` - Application-level orchestrators

## Creating New Constructs

### Construct Template

```typescript
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';

export interface MyConstructProps {
  // Required props
  readonly name: string;

  // Optional props with defaults
  readonly memorySize?: number;
}

export class MyConstruct extends Construct {
  // Public properties for cross-stack references
  public readonly resourceArn: string;

  constructor(scope: Construct, id: string, props: MyConstructProps) {
    super(scope, id);

    // Validation
    if (!props.name) {
      throw new Error('name is required');
    }

    // Resource creation
    const resource = new cdk.aws_lambda.Function(this, 'Function', {
      functionName: props.name,
      memorySize: props.memorySize ?? 1024,
      // ...
    });

    this.resourceArn = resource.functionArn;
  }
}
```

## Key Patterns

### 1. Naming Convention

Use `@codeiqlabs/aws-utils` for consistent naming:

```typescript
import { generateResourceName } from '@codeiqlabs/aws-utils';

const functionName = generateResourceName({
  company: 'CodeIQLabs',
  project: 'SaaS',
  environment: 'nprd',
  resourceType: 'lambda',
  resourceName: 'api-savvue',
});
// Result: "saas-nprd-api-savvue"
```

### 2. Cross-Stack References

Export values for cross-stack references:

```typescript
export class MyConstruct extends Construct {
  public readonly bucketName: string;
  public readonly bucketArn: string;

  constructor(scope: Construct, id: string, props: MyConstructProps) {
    super(scope, id);

    const bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: props.bucketName,
    });

    this.bucketName = bucket.bucketName;
    this.bucketArn = bucket.bucketArn;
  }
}
```

### 3. Environment-Aware Configuration

Use environment parameter for conditional logic:

```typescript
export interface MyConstructProps {
  readonly environment: 'nprd' | 'prod';
}

export class MyConstruct extends Construct {
  constructor(scope: Construct, id: string, props: MyConstructProps) {
    super(scope, id);

    const retentionDays = props.environment === 'prod' ? 30 : 7;

    new logs.LogGroup(this, 'LogGroup', {
      retention: logs.RetentionDays[`DAYS_${retentionDays}`],
    });
  }
}
```

### 4. Tagging

Apply tags to all resources:

```typescript
cdk.Tags.of(this).add('Environment', props.environment);
cdk.Tags.of(this).add('Project', 'SaaS');
cdk.Tags.of(this).add('ManagedBy', 'CDK');
```

## Testing Constructs

### Unit Tests

```typescript
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MyConstruct } from '../src/constructs/my-construct';

test('MyConstruct creates Lambda function', () => {
  const app = new App();
  const stack = new Stack(app, 'TestStack');

  new MyConstruct(stack, 'MyConstruct', {
    name: 'test-function',
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'test-function',
  });
});
```

## Common Constructs

### Lambda Function with API Gateway

```typescript
export class LambdaApiConstruct extends Construct {
  public readonly functionArn: string;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: LambdaApiProps) {
    super(scope, id);

    const fn = new lambda.Function(this, 'Function', {
      // ...
    });

    const api = new apigateway.LambdaRestApi(this, 'Api', {
      handler: fn,
      // ...
    });

    this.functionArn = fn.functionArn;
    this.apiUrl = api.url;
  }
}
```

### S3 Bucket with CloudFront OAC

```typescript
export class S3CloudFrontConstruct extends Construct {
  public readonly bucketName: string;
  public readonly distributionId: string;

  constructor(scope: Construct, id: string, props: S3CloudFrontProps) {
    super(scope, id);

    const bucket = new s3.Bucket(this, 'Bucket', {
      // ...
    });

    const oac = new cloudfront.CfnOriginAccessControl(this, 'OAC', {
      // ...
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      // ...
    });

    this.bucketName = bucket.bucketName;
    this.distributionId = distribution.distributionId;
  }
}
```

## Anti-Patterns

- ❌ Don't hardcode resource names - use naming utilities
- ❌ Don't create constructs without props interface
- ❌ Don't forget to export public properties for cross-stack references
- ❌ Don't skip validation in constructor
- ❌ Don't create constructs that do too much - keep them focused
- ❌ Don't forget to add tags to resources
