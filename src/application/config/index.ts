/**
 * Configuration Management Module Exports
 *
 * This module provides centralized exports for all configuration management
 * functionality, including factory options and application configuration.
 */

// Configuration types and utilities
export type { FactoryOptions } from './factory-options';
export { DEFAULT_FACTORY_OPTIONS, mergeFactoryOptions } from './factory-options';

// Application configuration
export type { AppConfig } from './app-config';
export { ConfigValidationError, validateFactoryOptions, createAppConfig } from './app-config';
