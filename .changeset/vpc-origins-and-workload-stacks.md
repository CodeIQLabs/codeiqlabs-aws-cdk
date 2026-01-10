---
"@codeiqlabs/aws-cdk": minor
---

### VPC Origins and Workload Infrastructure Stacks

**New Customization Stacks:**
- `InfraVpcStack` - VPC for CloudFront VPC origins with public/private subnets
- `InfraAlbStack` - Internal ALB for VPC origin routing with header-based rules
- `VpcOriginStack` - CloudFront VPC origin configuration
- `SubdomainZoneStack` - Delegated subdomain hosted zones in management account
- `OriginDomainStack` - Origin domain A records for ALB endpoints
- `AlbDnsRecordStack` - ALB DNS records in delegated subdomain zones
- `AlbHttpsListenerStack` - HTTPS listener with header-based routing rules
- `WorkloadParamsStack` - SSM parameters for cross-account sharing

**New Domain Stacks:**
- `CloudFrontVpcOriginStack` - CloudFront distributions with VPC origins (replaces CloudFrontDistributionStack)
- `StaticWebappStack` - S3 static hosting with CloudFront (moved from workload)

**New Workload Stacks:**
- `EcrRepositoryStack` - ECR repositories for container images

**Updated Stacks:**
- `GithubOidcStack` - Updated for targetEnvironments schema
- `IdentityCenterStack` - Updated for compact assignments format
- `OrganizationsStack` - Updated for convention-over-configuration
- `BaseStack` - Added skipEnvironment support for stack naming

**Breaking Changes:**
- Removed `CloudFrontDistributionStack` - replaced by `CloudFrontVpcOriginStack`
- Removed domain foundation/wireup stages - simplified to direct stack creation
- Updated to @codeiqlabs/aws-utils@1.10.0 schema changes
