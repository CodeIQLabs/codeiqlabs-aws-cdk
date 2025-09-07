/**
 * Declarative Management Base Stage
 *
 * This module provides an enhanced base stage class that implements the
 * declarative stack registration pattern for management account infrastructure.
 * Subclasses simply register their stacks declaratively and the base class
 * handles creation, dependencies, and conditional logic automatically.
 */

import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { ManagementBaseStage } from './management-base-stage';
import type { EnhancedManagementStageProps } from './stage-types';
import type { ManagementStackRegistration, DeclarativeStackResult } from './declarative-types';

/**
 * Enhanced management base stage with declarative stack registration
 *
 * This class extends ManagementBaseStage to provide declarative stack creation.
 * Subclasses implement registerStacks() to define their infrastructure
 * declaratively, and the base class handles all the creation logic.
 *
 * Benefits:
 * - Eliminates repetitive stack creation code
 * - Automatic dependency resolution
 * - Conditional stack creation based on manifest flags
 * - Type-safe stack registration
 * - Consistent error handling and validation
 */
export abstract class DeclarativeManagementBaseStage extends ManagementBaseStage {
  /** Map of component names to created stacks */
  protected readonly createdStacks: Record<string, cdk.Stack> = {};

  /** Map of component names to stack creation results */
  protected readonly stackResults: Record<string, DeclarativeStackResult<any>> = {};

  constructor(scope: Construct, id: string, props: EnhancedManagementStageProps) {
    super(scope, id, props);
  }

  /**
   * Abstract method for subclasses to register their stacks
   *
   * Subclasses should return an array of stack registrations that define
   * what stacks to create, when to create them, and how to configure them.
   */
  protected abstract registerStacks(): ManagementStackRegistration<any>[];

  /**
   * Create all registered stacks with automatic dependency resolution
   *
   * This method processes the stack registrations in order, creating each
   * stack only if it's enabled in the manifest. Dependencies are automatically
   * resolved and injected into the additionalProps function.
   */
  protected createRegisteredStacks(): void {
    const registrations = this.registerStacks();

    // Validate registrations
    this.validateRegistrations(registrations);

    // Create stacks in registration order
    for (const registration of registrations) {
      const result = this.createRegisteredStack(registration);
      this.stackResults[registration.component] = result;

      if (result.created) {
        this.createdStacks[registration.component] = result.stack;
      }
    }
  }

  /**
   * Create a single registered stack
   */
  private createRegisteredStack<T extends cdk.Stack>(
    registration: ManagementStackRegistration<T>,
  ): DeclarativeStackResult<T> {
    const { stackClass, component, enabled, dependencies = [], additionalProps } = registration;

    // Check if stack should be created
    if (!enabled(this.manifest)) {
      return {
        stack: undefined as any, // Stack not created
        component,
        stackName: this.naming.stackName(component),
        created: false,
      };
    }

    // Resolve dependencies
    const resolvedDependencies = this.resolveDependencies(dependencies, component);

    // Generate additional props
    const extraProps = additionalProps?.(this.manifest, resolvedDependencies) || {};

    // Create the stack
    const stackResult = this.createStack(stackClass, component, {
      dependencies: Object.values(resolvedDependencies),
      additionalProps: extraProps,
    });

    return {
      stack: stackResult.stack,
      component,
      stackName: stackResult.stackName,
      created: true,
    };
  }

  /**
   * Resolve stack dependencies by component name
   */
  private resolveDependencies(
    dependencies: string[],
    currentComponent: string,
  ): Record<string, cdk.Stack> {
    const resolved: Record<string, cdk.Stack> = {};

    for (const depComponent of dependencies) {
      const depStack = this.createdStacks[depComponent];
      if (!depStack) {
        throw new Error(
          `Stack '${currentComponent}' depends on '${depComponent}', but '${depComponent}' was not created. ` +
            `Ensure '${depComponent}' is registered before '${currentComponent}' and is enabled in the manifest.`,
        );
      }
      resolved[depComponent] = depStack;
    }

    return resolved;
  }

  /**
   * Validate stack registrations for common issues
   */
  private validateRegistrations(registrations: ManagementStackRegistration<any>[]): void {
    const components = new Set<string>();

    for (const registration of registrations) {
      // Check for duplicate component names
      if (components.has(registration.component)) {
        throw new Error(
          `Duplicate component name '${registration.component}' in stack registrations`,
        );
      }
      components.add(registration.component);

      // Validate dependencies exist in the registration list
      if (registration.dependencies) {
        for (const dep of registration.dependencies) {
          const depIndex = registrations.findIndex((r) => r.component === dep);
          const currentIndex = registrations.findIndex(
            (r) => r.component === registration.component,
          );

          if (depIndex === -1) {
            throw new Error(
              `Stack '${registration.component}' depends on '${dep}', but '${dep}' is not registered`,
            );
          }

          if (depIndex >= currentIndex) {
            throw new Error(
              `Stack '${registration.component}' depends on '${dep}', but '${dep}' is registered after it. ` +
                `Dependencies must be registered before their dependents.`,
            );
          }
        }
      }
    }
  }

  /**
   * Get a created stack by component name
   */
  public getStack<T extends cdk.Stack>(component: string): T | undefined {
    return this.createdStacks[component] as T;
  }

  /**
   * Get stack creation result by component name
   */
  public getStackResult<T extends cdk.Stack>(
    component: string,
  ): DeclarativeStackResult<T> | undefined {
    return this.stackResults[component];
  }

  /**
   * Get all created stacks
   */
  public getAllStacks(): Record<string, cdk.Stack> {
    return { ...this.createdStacks };
  }

  /**
   * Check if a stack was created
   */
  public isStackCreated(component: string): boolean {
    return this.stackResults[component]?.created === true;
  }
}
