const assert = require('node:assert/strict');
const path = require('node:path');

const root = require(path.join(__dirname, '..', 'dist', 'index.cjs'));
assert.ok(typeof root === 'object', 'aws-cdk utilities should be available');

// Test that core utilities are available
const { createApp, BaseStack, ComponentOrchestrator, GitHubOidcStack } = root;
assert.ok(typeof createApp === 'function', 'createApp factory should be available');
assert.ok(typeof BaseStack === 'function', 'BaseStack class should be available');
assert.ok(
  typeof ComponentOrchestrator === 'function',
  'ComponentOrchestrator class should be available',
);
assert.ok(typeof GitHubOidcStack === 'function', 'GitHubOidcStack class should be available');

// eslint-disable-next-line no-console
console.log('✅ AWS CDK config smoke test passed');
