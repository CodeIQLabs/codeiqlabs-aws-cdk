/**
 * ACM construct type definitions
 */

export * from './constructs';

/**
 * ACM certificate types
 */
export type AcmCertificateType = 'single-domain' | 'wildcard' | 'multi-domain';

/**
 * ACM validation methods
 */
export type AcmValidationMethod = 'dns' | 'email';

/**
 * ACM certificate status
 */
export type AcmCertificateStatus =
  | 'pending'
  | 'issued'
  | 'inactive'
  | 'expired'
  | 'validation_timed_out'
  | 'revoked'
  | 'failed';
