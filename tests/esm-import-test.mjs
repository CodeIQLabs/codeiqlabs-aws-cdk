// Test ESM imports for aws-cdk
import { ManagementBaseStack, WorkloadBaseStack } from '../dist/index.js';

console.log('Testing ESM imports for aws-cdk...');

// Test that utilities are available
if (typeof ManagementBaseStack !== 'function') {
  throw new Error('ManagementBaseStack should be a function');
}

if (typeof WorkloadBaseStack !== 'function') {
  throw new Error('WorkloadBaseStack should be a function');
}

console.log('✅ ESM import test for aws-cdk passed');
