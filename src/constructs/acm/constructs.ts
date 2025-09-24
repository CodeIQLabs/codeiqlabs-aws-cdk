/**
 * ACM SSL Certificate constructs
 */

import {
  Certificate,
  CertificateValidation,
  ValidationMethod,
} from 'aws-cdk-lib/aws-certificatemanager';
import type { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { NamedConstruct, type NamedConstructProps } from '../../core/constructs/named-construct';
import type { Construct } from 'constructs';

/**
 * Properties for ACM certificate constructs
 */
export interface AcmCertificateConstructProps extends NamedConstructProps {
  /**
   * Primary domain name for the certificate
   */
  readonly domainName: string;

  /**
   * Subject alternative names (additional domains)
   */
  readonly subjectAlternativeNames?: string[];

  /**
   * Hosted zone for DNS validation
   */
  readonly hostedZone: IHostedZone;

  /**
   * Validation method
   */
  readonly validationMethod?: ValidationMethod;

  /**
   * Certificate type (wildcard, single-domain, multi-domain)
   */
  readonly certificateType?: string;
}

/**
 * ACM certificate construct with built-in naming, tagging, and best practices
 */
export class AcmCertificateConstruct extends NamedConstruct {
  public readonly certificate: Certificate;
  public readonly domainName: string;
  public readonly certificateType: string;

  constructor(scope: Construct, id: string, props: AcmCertificateConstructProps) {
    super(scope, id, {
      ...props,
      resourceType: 'acm-certificate',
    });

    this.domainName = props.domainName;
    this.certificateType = props.certificateType || this.determineCertificateType(props);

    // Create ACM certificate
    this.certificate = new Certificate(this, this.generateLogicalId('certificate'), {
      domainName: props.domainName,
      subjectAlternativeNames: props.subjectAlternativeNames,

      // Use DNS validation with the provided hosted zone
      validation: CertificateValidation.fromDns(props.hostedZone),

      // Certificate name for identification
      certificateName: this.generateResourceName('cert', this.getCertificateNameSuffix(props)),
    });

    // Apply ACM-specific tags
    this.applyAcmSpecificTags();
  }

  /**
   * Determine certificate type based on domain configuration
   */
  private determineCertificateType(props: AcmCertificateConstructProps): string {
    if (props.domainName.startsWith('*.')) {
      return 'wildcard';
    } else if (props.subjectAlternativeNames && props.subjectAlternativeNames.length > 0) {
      return 'multi-domain';
    } else {
      return 'single-domain';
    }
  }

  /**
   * Get certificate name suffix based on domain
   */
  private getCertificateNameSuffix(props: AcmCertificateConstructProps): string {
    const domain = props.domainName.replace(/\*/g, 'wildcard').replace(/\./g, '-');
    return domain;
  }

  /**
   * Apply ACM-specific tags
   */
  private applyAcmSpecificTags(): void {
    const acmTags = {
      Service: 'ACM',
      DomainName: this.domainName,
      CertificateType: this.certificateType,
      ValidationMethod: 'DNS',
    };

    Object.entries(acmTags).forEach(([key, value]) => {
      this.certificate.node.addMetadata(key, value);
    });
  }

  /**
   * Get the component name for tagging
   */
  protected getComponentName(): string {
    return `acm-${this.certificateType}`;
  }

  /**
   * Get certificate ARN
   */
  public getCertificateArn(): string {
    return this.certificate.certificateArn;
  }

  /**
   * Get certificate domain name
   */
  public getCertificateDomainName(): string {
    return this.domainName;
  }

  /**
   * Check if certificate is for wildcard domain
   */
  public isWildcardCertificate(): boolean {
    return this.certificateType === 'wildcard';
  }

  /**
   * Check if certificate is for multiple domains
   */
  public isMultiDomainCertificate(): boolean {
    return this.certificateType === 'multi-domain';
  }
}
