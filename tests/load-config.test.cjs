const assert = require('node:assert/strict');
const path = require('node:path');

const root = require(path.join(__dirname, '..', 'dist', 'cjs', 'index.js'));
assert.ok(typeof root === 'object', 'aws-cdk utilities should be available');

// Test that core utilities are available
const { ManagementBaseStack, WorkloadBaseStack } = root;
assert.ok(typeof ManagementBaseStack === 'function', 'ManagementBaseStack class should be available');
assert.ok(typeof WorkloadBaseStack === 'function', 'WorkloadBaseStack class should be available');

console.log('✅ AWS CDK config smoke test passed');
