---
'@codeiqlabs/aws-cdk': patch
---

# Fix Dependency Conflicts and Align AWS CDK Versions v1.2.1

This patch release resolves dependency conflicts and aligns AWS CDK versions across the CodeIQLabs ecosystem for clean npm installs without legacy peer dependency flags.

## 🔧 **Dependency Fixes**

### **AWS CDK Version Alignment**
- **aws-cdk-lib**: Updated from `^2.150.0` to `^2.213.0` to match aws-utils peer dependency
- **aws-cdk**: Updated from `2.123.0` to `^2.213.0` for consistency
- **Peer Dependencies**: Updated `aws-cdk-lib` peer dependency from `2.208.0` to `^2.213.0`

### **TypeScript and ESLint Alignment**
- **@typescript-eslint/eslint-plugin**: Aligned to `^8.39.1` across ecosystem
- **@typescript-eslint/parser**: Aligned to `^8.39.1` across ecosystem
- **eslint**: Updated to `^9.33.0` for consistency

## 🎯 **Benefits**

- ✅ **Clean npm install**: No more `--legacy-peer-deps` flag required
- ✅ **Version consistency**: All AWS CDK packages use compatible versions
- ✅ **Ecosystem alignment**: Consistent dependency versions across CodeIQLabs packages
- ✅ **Workspace compatibility**: Maintains hybrid workspace + semantic versioning strategy

## 🔄 **Migration Notes**

### **For Consuming Packages**
- Update to `@codeiqlabs/aws-cdk: ^1.2.1` in your package.json
- Ensure `aws-cdk-lib: ^2.213.0` is used consistently
- Run `npm install` (no legacy flags needed)

### **Compatibility**
- ✅ **Backward compatible**: No breaking changes to public APIs
- ✅ **Workspace linking**: Continues to work seamlessly in development
- ✅ **CI/CD builds**: Clean dependency resolution in all environments

This release ensures clean dependency resolution across the entire CodeIQLabs ecosystem while maintaining all existing functionality.
