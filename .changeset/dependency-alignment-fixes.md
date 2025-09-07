---
'@codeiqlabs/aws-cdk': patch
---

# Dependency Alignment and Peer Dependency Fixes

This update resolves dependency conflicts and aligns AWS CDK versions across the CodeIQLabs
ecosystem for clean npm installs without legacy peer dependency flags.

## 🔧 **Dependency Fixes**

### **AWS CDK Version Alignment**

- **aws-cdk-lib**: Updated from `^2.150.0` to `^2.213.0` to match aws-utils peer dependency
- **aws-cdk**: Updated from `2.123.0` to `^2.213.0` for consistency
- **Peer Dependencies**: Updated `aws-cdk-lib` peer dependency from `2.208.0` to `^2.213.0`

### **CodeIQLabs Package Alignment**

- **@codeiqlabs/eslint-prettier-config**: Updated from `^1.8.0` to `^1.7.0` to match published
  version
- **TypeScript ESLint**: Aligned to `^8.39.1` across ecosystem
- **ESLint**: Updated to `^9.33.0` for consistency

## 🎯 **Benefits**

- ✅ **Clean npm install**: No more `--legacy-peer-deps` flag required
- ✅ **Version consistency**: All AWS CDK packages use compatible versions
- ✅ **Ecosystem alignment**: Consistent dependency versions across CodeIQLabs packages
- ✅ **Workspace compatibility**: Maintains hybrid workspace + semantic versioning strategy
- ✅ **Zero vulnerabilities**: Clean dependency tree with no security issues

## 🔄 **Migration Notes**

### **For Consuming Packages**

- Continue using `@codeiqlabs/aws-cdk: ^1.2.0` in your package.json
- Ensure `aws-cdk-lib: ^2.213.0` is used consistently
- Run `npm install` (no legacy flags needed)

### **Compatibility**

- ✅ **Backward compatible**: No breaking changes to public APIs
- ✅ **Workspace linking**: Continues to work seamlessly in development
- ✅ **CI/CD builds**: Clean dependency resolution in all environments

**Note**: This changeset documents dependency alignment changes for transparency. Version remains at
1.2.0 following library repository policy - versions are only incremented for actual code changes,
not dependency updates.
