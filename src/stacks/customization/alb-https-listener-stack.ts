import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import { BaseStack, type BaseStackProps } from '../base/base-stack';

/**
 * ALB HTTPS Listener Stack
 *
 * Creates HTTPS listener on ALB with certificates from SubdomainZoneStack.
 * This stack breaks the circular dependency between AlbStack and SubdomainZoneStack.
 *
 * **Dependency Order:**
 * 1. InfraAlbStack (creates ALB)
 * 2. SubdomainZoneStack (creates certificates)
 * 3. AlbHttpsListenerStack (creates HTTPS listener with certificates)
 */

export interface AlbHttpsListenerStackProps extends BaseStackProps {
  /** Application Load Balancer */
  alb: elbv2.IApplicationLoadBalancer;
  /** Map of certificates (domain → certificate) */
  certificates: Map<string, certificatemanager.ICertificate>;
}

export class AlbHttpsListenerStack extends BaseStack {
  public readonly httpsListener: elbv2.IApplicationListener;

  constructor(scope: Construct, id: string, props: AlbHttpsListenerStackProps) {
    super(scope, id, 'AlbHttpsListener', props);

    if (props.certificates.size === 0) {
      throw new Error('At least one certificate is required for HTTPS listener');
    }

    // Get first certificate for the listener
    const firstCert = Array.from(props.certificates.values())[0];

    // Create HTTPS listener
    this.httpsListener = props.alb.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [firstCert],
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found - ALB HTTPS Listener',
      }),
    });

    // Add remaining certificates
    const remainingCerts = Array.from(props.certificates.values()).slice(1);
    if (remainingCerts.length > 0) {
      this.httpsListener.addCertificates('AdditionalCerts', remainingCerts);
    }

    // Export HTTPS listener ARN
    new cdk.CfnOutput(this, 'HttpsListenerArn', {
      value: this.httpsListener.listenerArn,
      description: 'HTTPS Listener ARN',
      exportName: this.naming.exportName('alb-https-listener-arn'),
    });
  }
}
