/**
 * Application Factories Module Exports
 *
 * This module provides centralized exports for all application factory functionality,
 * including the main factory functions and shared utilities.
 */

// Main factory functions
export { createAutoApp, createManagementApp, createWorkloadApp } from './app-factory';

// Factory utilities
export {
  FactoryError,
  createConfiguredApplication,
  validateApplicationType,
} from './factory-utils';
