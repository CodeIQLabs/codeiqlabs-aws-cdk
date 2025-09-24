/**
 * Management Component Detection Logic
 *
 * This module provides detection logic for determining which management
 * components are enabled in a management manifest configuration.
 */

/**
 * Management configuration interface for our new standards
 * This will replace the existing ManagementAppConfig
 */
export interface ManagementConfig {
  type: 'management';
  project: string;
  company: string;

  // Management account configuration
  management: {
    accountId: string;
    region: string;
    environment: string;
  };

  // AWS Organizations configuration
  organizations?: {
    enabled: boolean;
    organizationalUnits?: Array<{
      name: string;
      accounts?: Array<{
        name: string;
        email: string;
        accountId?: string;
      }>;
    }>;
  };

  // Identity Center configuration
  identityCenter?: {
    enabled: boolean;
    permissionSets?: Array<{
      name: string;
      description: string;
      managedPolicies?: string[];
    }>;
  };

  // Domain authority configuration
  domainAuthority?: {
    enabled: boolean;
    domains?: Array<{
      name: string;
      hostedZoneId?: string;
      delegations?: Array<{
        subdomain: string;
        targetAccount: string;
      }>;
    }>;
  };
}

/**
 * Detect which management components are enabled in the configuration
 *
 * @param config - Management application configuration
 * @returns Array of enabled component names
 */
export function detectManagementComponents(config: ManagementConfig): string[] {
  const components: string[] = [];

  // Check for AWS Organizations configuration
  if (hasOrganizationsConfig(config)) {
    components.push('organizations');
  }

  // Check for Identity Center configuration
  if (hasIdentityCenterConfig(config)) {
    components.push('identityCenter');
  }

  // Check for domain authority configuration
  if (hasDomainAuthorityConfig(config)) {
    components.push('domainAuthority');
  }

  return components;
}

/**
 * Check if AWS Organizations configuration is present
 */
function hasOrganizationsConfig(config: ManagementConfig): boolean {
  return !!(config.organizations && config.organizations.enabled === true);
}

/**
 * Check if Identity Center configuration is present
 */
function hasIdentityCenterConfig(config: ManagementConfig): boolean {
  return !!(config.identityCenter && config.identityCenter.enabled === true);
}

/**
 * Check if domain authority configuration is present
 */
function hasDomainAuthorityConfig(config: ManagementConfig): boolean {
  return !!(config.domainAuthority && config.domainAuthority.enabled === true);
}
