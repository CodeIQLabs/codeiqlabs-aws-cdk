/**
 * Management Account Stack Classes
 *
 * This module provides reusable stack classes for common management account
 * infrastructure patterns. These stacks follow the BaseStack + L2 Construct
 * pattern and can be used across any CodeIQLabs management account setup.
 *
 * Available stacks:
 * - ManagementOrganizationsStack: AWS Organizations setup
 * - ManagementIdentityCenterStack: AWS Identity Center (SSO) setup
 *
 * Each stack wraps a single high-level construct with minimal business logic,
 * making them reusable across different projects and organizations.
 */

export { ManagementOrganizationsStack } from './organizations-stack';
export type { ManagementOrganizationsStackProps } from './organizations-stack';

export { ManagementIdentityCenterStack } from './identity-center-stack';
export type { ManagementIdentityCenterStackProps } from './identity-center-stack';
