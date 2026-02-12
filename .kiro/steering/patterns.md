---
inclusion: fileMatch
fileMatchPattern: 'src/patterns/**/*'
---

# CDK Patterns Architecture

## Overview

Patterns are high-level infrastructure compositions that group stacks and orchestration logic for a
specific deployment architecture. Each pattern encapsulates a complete infrastructure topology
(e.g., serverless SaaS, ECS workload).

## Directory Structure

Each pattern follows this layout:

    src/patterns/{pattern-name}/
    ├── index.ts              # Barrel exports
    ├── orchestrator.ts       # Pattern-specific orchestration logic
    └── stacks/
        ├── index.ts
        ├── edge/             # CDN, DNS, certificates (management account)
        └── workload/         # Compute, storage, messaging (workload accounts)

## Layering Model

    Layer 0: Foundation     (src/core/)        - TaggedConstruct, NamedConstruct
    Layer 1: Constructs     (src/constructs/)   - Generic AWS service constructs (shared)
    Layer 2: Shared Stacks  (src/stacks/)       - Organizations, Identity Center, OIDC
    Layer 3: Patterns       (src/patterns/)     - Pattern-specific orchestration + stacks
    Layer 4: Application    (src/application/)  - createApp(), ComponentOrchestrator dispatcher

L1 constructs are shared across all patterns. Pattern stacks compose L1 constructs into
architecture-specific deployments. The dispatcher detects which pattern applies based on manifest
sections and delegates accordingly.

## Pattern Isolation: L1 Container vs L2 Implementations

The patterns directory uses a two-level isolation model:

**L1 — Pattern Container** (`src/patterns/`):

- The `ComponentOrchestrator` acts as a thin dispatcher at this level
- It detects which pattern applies from the manifest and delegates to the correct L2 orchestrator
- No pattern-specific logic lives here — only detection and dispatch

**L2 — Pattern Implementation** (`src/patterns/{pattern-name}/`):

- Each L2 pattern is fully self-contained with its own orchestrator, stacks, and barrel exports
- L2 patterns are isolated from each other — no cross-pattern imports or dependencies
- Currently: `serverless-saas/` is the only L2 pattern

**Adding a new L2 pattern** (e.g., `ecs-workload/`):

1. Create `src/patterns/ecs-workload/` with its own orchestrator and stacks
2. Add a detection branch in `ComponentOrchestrator.createStages()`
3. No changes needed to existing L2 patterns — isolation is guaranteed

This design ensures new infrastructure patterns can be added without risk of breaking existing
deployments.

## Creating a New Pattern

1. Create directory: `src/patterns/{pattern-name}/`
2. Create orchestrator implementing `BaseOrchestrator` - receives `OrchestrationContext`
3. Place stacks under `stacks/edge/` and `stacks/workload/` as needed
4. Export from `src/patterns/{pattern-name}/index.ts`
5. Add re-export in `src/patterns/index.ts`
6. Add detection branch in `ComponentOrchestrator.createStages()`

## Shared vs Pattern-Specific Stacks

**Shared** (`src/stacks/`): Pattern-agnostic infrastructure - Organizations, Identity Center, GitHub
OIDC, BaseStack. These would be the same regardless of deployment architecture.

**Pattern** (`src/patterns/{name}/stacks/`): Architecture-specific compositions. A stack belongs in
a pattern if it would differ for a different architecture (e.g., CloudFront config differs between
serverless API origins and ALB origins).

## Existing Patterns

### Serverless SaaS (`serverless-saas/`)

Multi-brand SaaS on Lambda + API Gateway + DynamoDB:

- **Edge**: CloudFront -> S3 (webapp/marketing), CloudFront -> API Gateway (APIs)
- **Workload**: Lambda, API Gateway, DynamoDB, EventBridge, ECR, S3, Secrets Manager

Triggered by manifest sections: `saasWorkload`, `saasEdge`, `infrastructure`, `domains`

## Cross-Stack Dependencies in Patterns

Pattern orchestrators wire stacks together. Be careful with cross-stack construct references — they
create implicit CloudFormation exports/imports that can cause cyclic dependencies.

**Known issue (resolved):** EventBridgeStack ↔ EventHandlerLambdaStack had a cyclic dependency
because EventBridge needed Lambda ARNs (for targets) and Lambda needed EventBridge (for
permissions). The fix was to have EventHandlerLambdaStack write Lambda ARNs to SSM, and
EventBridgeStack read them via `ssm.StringParameter.valueForStringParameter()`. The orchestrator
keeps `addDependency()` for deploy-time ordering without creating CloudFormation cross-stack refs.

**Pattern for inter-stack data sharing within a pattern:**

- Use SSM parameters for ARNs, names, and other string values
- Use `addDependency()` in the orchestrator for deploy-time ordering only
- Avoid passing construct objects between stacks that reference each other

## Anti-Patterns

- Don't add pattern-specific logic to `ComponentOrchestrator` - it should only dispatch
- Don't create cross-pattern dependencies between stacks in different patterns
- Don't put shared infrastructure (Organizations, OIDC) inside a pattern
- Don't duplicate L1 constructs in patterns - import from `src/constructs/`
- Don't reference stacks from one pattern inside another pattern's orchestrator
- Don't pass construct references between stacks that need to reference each other — use SSM
