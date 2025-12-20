// Test ESM imports for aws-cdk
import { BaseStack, ComponentOrchestrator, GitHubOidcStack, createApp } from '../dist/index.js';

// eslint-disable-next-line no-console
console.log('Testing ESM imports for aws-cdk...');

// Test that utilities are available
if (typeof createApp !== 'function') {
  throw new Error('createApp should be a function');
}

if (typeof BaseStack !== 'function') {
  throw new Error('BaseStack should be a function');
}

if (typeof ComponentOrchestrator !== 'function') {
  throw new Error('ComponentOrchestrator should be a function');
}

if (typeof GitHubOidcStack !== 'function') {
  throw new Error('GitHubOidcStack should be a function');
}

// eslint-disable-next-line no-console
console.log('✅ ESM import test for aws-cdk passed');
