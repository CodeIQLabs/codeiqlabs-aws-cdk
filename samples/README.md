# Sample Manifests

This directory contains sample manifest files demonstrating how to configure each stack type in the
CodeIQLabs AWS CDK framework.

## Overview

Each sample manifest shows the required configuration to create specific AWS infrastructure stacks.
Copy and modify these samples to match your organization's needs.

---

## Sample Files

### 1. Organizations Stack

**File:** `01-organizations-stack.yaml`  
**Stack Created:** `ManagementOrganizationsStack`

Creates AWS Organizations with organizational units (OUs) and accounts.

**What you get:**

- AWS Organization with custom OU structure
- Multiple AWS accounts organized by environment
- Service Control Policies (SCPs)
- Organizational tagging

**Use case:** Setting up a new AWS organization or managing an existing one with multiple accounts.

---

### 2. Identity Center Stack

**File:** `02-identity-center-stack.yaml`  
**Stack Created:** `ManagementIdentityCenterStack`

Creates AWS Identity Center (SSO) with users, groups, permission sets, and account assignments.

**What you get:**

- IAM Identity Center users
- Permission sets with AWS managed and custom policies
- Account assignments (who can access which accounts)
- Centralized SSO authentication

**Use case:** Setting up centralized identity management and SSO access across multiple AWS
accounts.

---

### 3. Domain Delegation Stack

**File:** `03-domain-delegation-stack.yaml`  
**Stack Created:** `DomainDelegationStack`

Creates Route53 hosted zones with cross-account DNS delegation.

**What you get:**

- Route53 hosted zones for your domains
- Cross-account subdomain delegation
- ACM SSL certificates with DNS validation
- NS records for delegated subdomains

**Use case:** Managing DNS from a central management account while delegating subdomains to workload
accounts.

---

### 4. Static Hosting Stacks

**File:** `04-static-hosting-stacks.yaml`  
**Stacks Created:** `StaticHostingDomainStack`, `StaticHostingFrontendStack`

Creates complete static website hosting infrastructure with S3, CloudFront, and ACM.

**What you get:**

- **Domain Stack:** Route53 hosted zone + ACM SSL certificate
- **Frontend Stack:** S3 bucket + CloudFront distribution + DNS records
- Multi-environment support (staging, production)
- HTTPS with automatic certificate validation

**Use case:** Hosting static websites or single-page applications (SPAs) with global CDN delivery.

---

### 5. Complete Management Account

**File:** `05-complete-management-account.yaml`  
**Stacks Created:** `ManagementOrganizationsStack`, `ManagementIdentityCenterStack`,
`DomainDelegationStack`

Complete management account setup combining all governance components.

**What you get:**

- Everything from samples 1, 2, and 3 combined
- Full organizational governance setup
- Centralized identity and access management
- Domain management with delegation

**Use case:** Complete setup for a new AWS organization with all governance components.

---

## How to Use These Samples

### Step 1: Choose Your Sample

Pick the sample that matches your infrastructure needs:

- **New organization?** Start with `05-complete-management-account.yaml`
- **Just need static hosting?** Use `04-static-hosting-stacks.yaml`
- **Individual components?** Use samples 1-3

### Step 2: Copy and Customize

```bash
# Copy the sample to your project
cp samples/05-complete-management-account.yaml ./manifest.yaml

# Edit with your values
vim manifest.yaml
```

### Step 3: Update Required Values

Replace these placeholder values with your actual AWS values:

| Placeholder               | How to Get It                            | Example                    |
| ------------------------- | ---------------------------------------- | -------------------------- |
| `123456789012`            | Your AWS account ID                      | `682475224767`             |
| `r-abc123`                | `aws organizations list-roots`           | `r-a1b2`                   |
| `ssoins-1234567890abcdef` | `aws sso-admin list-instances`           | `ssoins-7223fc1b4b2b2a3f`  |
| `d-1234567890`            | `aws identitystore list-identity-stores` | `d-9067d4e5e5`             |
| `Z1234567890ABC`          | `aws route53 list-hosted-zones`          | `Z0698154HBM0WT2J1IAT`     |
| `aws+*@mycompany.com`     | Your email addresses                     | `aws+prod@yourcompany.com` |

### Step 4: Create Your CDK App

Create a CDK bin file:

```typescript
// bin/app.ts
import { createApp } from '@codeiqlabs/aws-cdk';

async function main() {
  const app = await createApp({
    manifestPath: './manifest.yaml',
  });

  app.synth();
}

main();
```

### Step 5: Deploy

```bash
# Synthesize CloudFormation templates
cdk synth

# Deploy all stacks
cdk deploy --all

# Or deploy specific stacks
cdk deploy MyOrganization-mgmt-Organizations
cdk deploy MyOrganization-mgmt-IdentityCenter
```

---

## Environment Variables

You can use environment variables in your manifests:

```yaml
management:
  accountId: '${MANAGEMENT_ACCOUNT_ID}'
  region: '${AWS_REGION}'
```

Set them before deployment:

```bash
export MANAGEMENT_ACCOUNT_ID="123456789012"
export AWS_REGION="us-east-1"
cdk deploy --all
```

---

## Multi-Environment Deployments

For workload accounts with multiple environments (staging, production), use the `environments`
section:

```yaml
environments:
  nprd:
    accountId: '234567890123'
    region: 'us-east-1'
    config:
      domain:
        name: 'staging.mycompany.com'

  prod:
    accountId: '345678901234'
    region: 'us-east-1'
    config:
      domain:
        name: 'www.mycompany.com'
```

The framework automatically creates stacks for each environment.

---

## Common Patterns

### Pattern 1: Management Account Setup

1. Use `05-complete-management-account.yaml`
2. Deploy to management account
3. Creates org structure, SSO, and domain delegation

### Pattern 2: Workload Account with Static Hosting

1. Use `04-static-hosting-stacks.yaml`
2. Deploy to workload account
3. Creates domain and frontend stacks for each environment

### Pattern 3: Incremental Setup

1. Start with `01-organizations-stack.yaml`
2. Add `02-identity-center-stack.yaml`
3. Add `03-domain-delegation-stack.yaml`
4. Deploy workloads with `04-static-hosting-stacks.yaml`

---

## Validation

All manifests include schema validation:

```yaml
# yaml-language-server: $schema=https://schemas.codeiqlabs.dev/aws/manifest.schema.json
```

This provides:

- Auto-completion in VS Code
- Real-time validation
- Inline documentation

---

## Need Help?

- **Documentation:** See
  [Complete File Reference](../docs/codeiqlabs/aws-cdk/complete-file-reference.md)
- **Issues:** [GitHub Issues](https://github.com/CodeIQLabs/codeiqlabs-aws-cdk/issues)
- **Main README:** [../README.md](../README.md)

---

## Tips

1. **Start small:** Begin with one component, test it, then add more
2. **Use version control:** Track your manifest changes in Git
3. **Test in non-prod first:** Always test in staging before production
4. **Use environment variables:** Keep sensitive values out of manifests
5. **Tag everything:** Use consistent tagging for cost allocation and organization
