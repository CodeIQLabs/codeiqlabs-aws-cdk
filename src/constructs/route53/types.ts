/**
 * Route53 construct type definitions
 */

export * from './constructs';

/**
 * Route53 record types
 */
export type Route53RecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SOA';

/**
 * Route53 hosted zone types
 */
export type Route53HostedZoneType = 'public' | 'private';

/**
 * Route53 delegation types
 */
export type Route53DelegationType = 'root-domain' | 'subdomain' | 'cross-account';
