/**
 * Workload Pattern Detection Logic
 *
 * This module provides detection logic for determining which workload
 * pattern should be used based on the manifest configuration.
 */

/**
 * Workload configuration interface for our new standards
 * This will replace the existing WorkloadAppConfig
 */
export interface WorkloadConfig {
  type: 'workload';
  project: string;
  company: string;

  // Management account configuration
  management: {
    accountId: string;
    region: string;
    environment: string;
  };

  // Workload environments
  environments: {
    [envName: string]: {
      accountId: string;
      region: string;
      domain?: {
        name: string;
        hostedZoneId?: string;
      };
    };
  };

  // Static hosting configuration
  staticHosting?: {
    enabled: boolean;
    bucketName?: string;
    distributionConfig?: {
      priceClass?: string;
      cacheBehaviors?: Array<{
        pathPattern: string;
        ttl: number;
      }>;
    };
  };
}

/**
 * Supported workload patterns
 */
export type WorkloadPattern = 'static-hosting';

/**
 * Detect the workload pattern based on configuration
 *
 * @param config - Workload application configuration
 * @returns The detected workload pattern
 */
export function detectWorkloadPattern(config: WorkloadConfig): WorkloadPattern {
  // For now, we only support static hosting pattern
  // Future patterns could include: 'full-stack', 'api-only', 'data-pipeline', 'container'

  if (hasStaticHostingConfig(config)) {
    return 'static-hosting';
  }

  // Default to static hosting if no specific pattern is detected
  return 'static-hosting';
}

/**
 * Check if static hosting configuration is present
 */
function hasStaticHostingConfig(config: WorkloadConfig): boolean {
  return !!(
    config.staticHosting?.enabled === true ||
    // If environments have domain config, assume static hosting
    Object.values(config.environments).some((env) => env.domain) ||
    // Default to static hosting if no specific pattern is detected
    true
  );
}

/**
 * Future pattern detection functions (for reference):
 */

// function hasFullStackConfig(config: WorkloadAppConfig): boolean {
//   return !!(
//     config.database ||
//     config.api ||
//     (config.frontend && config.backend)
//   );
// }

// function hasApiOnlyConfig(config: WorkloadAppConfig): boolean {
//   return !!(
//     config.api &&
//     !config.frontend &&
//     !config.staticHosting
//   );
// }

// function hasDataPipelineConfig(config: WorkloadAppConfig): boolean {
//   return !!(
//     config.etl ||
//     config.dataLake ||
//     config.dataProcessing
//   );
// }

// function hasContainerConfig(config: WorkloadAppConfig): boolean {
//   return !!(
//     config.container ||
//     config.ecs ||
//     config.kubernetes
//   );
// }
