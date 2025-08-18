import { Tags } from 'aws-cdk-lib';
import type * as cdk from 'aws-cdk-lib';

/**
 * Apply global aspects (tags) to a CDK App
 *
 * @param app - The CDK App to apply aspects to
 * @param tags - Key-value pairs of tags to apply globally
 */
export function applyGlobalAspects(app: cdk.App, tags?: Record<string, string>): void {
  if (!tags || !Object.keys(tags).length) return;
  Object.entries(tags).forEach(([k, v]) => Tags.of(app).add(k, v));
}
