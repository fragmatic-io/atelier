# AGENTS.md

You are operating inside a CIR (Capability · Intent · Render) framework.
Read this file before reading any code.

For the operating manual that applies to **runtime** agents (chat, voice, autonomous), see [`docs/chat/runtime-instructions.md`](docs/chat/runtime-instructions.md). This file is for coding agents working _on_ this repository.

## What CIR is

CIR separates software into three artifacts:

1. **Capabilities + Skills** — public, owned by the app, versioned.
2. **Intent** — private, owned by the user, never modify directly.
3. **Render manifests** — ephemeral output, cached, regenerated only on trigger.

Your job depends on which artifact you are working with. Read [`ETHOS.md`](ETHOS.md) for the ten principles that govern every decision below.

## Where things live

CIR artifact directories (these define the framework surface):

- `/capabilities/` — typed action and data definitions (JSON schema)
- `/skills/` — markdown files describing how to use capabilities well
- `/components/` — UI primitive registry (JSON + TypeScript types)
- `/policies/` — confirmation rules, data access rules, PII rules
- `/evals/` — test cases for capabilities, skills, and generated manifests (`*.eval.ts`)
- `/recipes/` — default interface manifests for common personas
- `/.well-known/cir.json` — public discovery document (Phase 5)

Implementation packages (under the pnpm workspace at `/packages/`):

- `/packages/schemas/` — `@cir/schemas`: Zod schemas + generated JSON Schemas (BrandKit included)
- `/packages/policies/` — `@cir/policies`: pure-function manifest validators (7 baseline) + `PolicyRegistry` for app-supplied custom policies + `BehavioralPatternDetector` contract
- `/packages/evals/` — `@cir/evals`: eval harness, `defineEval()` helper, and `cir-evals` CLI
- `/packages/runtime/` — `@cir/runtime`: the framework-agnostic render SDK (manifest cache/fetcher/resolver, action dispatcher with `verbal_required` confirmation, trigger bus + SSE transport, registries, render-plan derivation, audit sink)
- `/packages/components/` — `@cir/components`: 56-component baseline catalog
- `/packages/react/` — `@cir/react`: React adapter (`<CirRuntime>`, `<CirRoute>`, hooks, confirm portal, SWR + optimistic UI)
- `/packages/compiler/` — `@cir/compiler`: the LLM-backed compile service (Gemini, `MemoryManifestStore` / `RedisManifestStore`, `FallbackCompiler`)
- `/packages/cli/` — later phase per `packages/README.md`
- `/scripts/` — repo-level harness scripts (e.g. `sanity.test.ts`); not for product code

The user's intent vault is NOT in this repo. It is referenced by ID only.
Manifests are NOT in this repo. They are produced by the compiler service.

Background reading on the framework lives in [`docs/`](docs/).

## Hard rules

1. **Never modify the intent vault directly.** Only the user, via their
   own agent, can write to their vault. You may request a permission
   grant; you may not assume it.

2. **Capability schema changes require a version bump and migration.**
   Any change to `/capabilities/*.json` that alters input, output, or
   side_effects MUST bump the version and ship a migration note.
   Old manifests pinned to old versions must continue to work for the
   deprecation window (default: 90 days).

3. **Components are append-only by default.** Removing a component
   breaks every manifest using it. Deprecate first, remove after
   90 days, with a clear migration path.

4. **Every action declares side_effects, permissions, and reversibility.**
   No exceptions. If an action cannot declare these honestly, it is
   not ready to ship.

5. **Confirmation policy is set per capability, not per UI.** The UI
   may surface a confirmation dialog more aggressively than the policy
   requires. It may never surface less.

6. **Generated UI must be validated against `/policies/`.** A manifest
   that exposes data the user did not grant, or omits required
   confirmations, is invalid and must not be served.

## When asked to add a capability

1. Define the JSON schema in `/capabilities/{domain}/{name}.json`.
2. Write the corresponding skill in `/skills/{name}.skill.md`.
3. Add at least 3 eval cases in `/evals/capabilities/{name}.eval.ts` (TypeScript — see `evals/README.md`).
4. Update `/.well-known/cir.json` to advertise the new capability.
5. Bump the registry version.
6. Do NOT write any UI for it. UI is generated.

## When asked to add a component

1. Add the props schema to `/components/registry.json`.
2. Implement the component in the runtime SDK.
3. Add usage examples in `/components/examples/{name}.json`.
4. Document allowed data sources and actions.
5. Add accessibility tests.
6. Bump the catalog version.

## When asked to "build a feature"

Stop. There is no "feature" in CIR.

A feature is one or more of: a new capability, a new skill, a new
component, a new policy, or a new default recipe. Identify which.
Ship them as separate artifacts. The interface that exposes the
feature is generated, not built.

## When asked to debug a UI

1. Find the manifest that produced it (logged with manifest_id).
2. Check `compiled_from` to see which artifact versions were used.
3. Reproduce locally using the compiler with the same inputs.
4. The bug is in one of: capability schema, skill description,
   component implementation, policy validation, or compiler prompt.
5. Fix at the source artifact. Do not patch the manifest directly.

## Caching and triggers

You do not invalidate caches manually. You publish trigger events:

- `capability.schema_changed` — when a capability version bumps
- `component.catalog_changed` — when components are added/deprecated
- `skill.version_changed` — when a skill is updated
- `policy.rule_changed` — when policies change

The trigger bus handles invalidation. Routes affected by a trigger
will recompile on next access. Untouched routes continue serving
cached manifests.

## Token budget

The compiler is expensive. The runtime is free. When in doubt:

- Move logic from the compiler prompt into structured skill descriptions.
- Move logic from skill descriptions into capability schemas.
- Move logic from runtime into manifest declarations.

A well-tuned skill set means the compiler does less reasoning and
more lookup. Aim for compiler calls measured in tens per user per
week, not per user per action.

## Source file headers

Every TypeScript/JavaScript source file (excluding tests, type declarations,
and generated files) must start with an SPDX header:

```
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
```

The check runs as part of `pnpm validate`. Run `pnpm fix:license-headers` to
auto-insert the header into any file that lacks it.

## CI / evals

PR CI runs `pnpm validate` (license, typecheck, lint, format, data, tests). The end-to-end Gemini smoke (`evals/end-to-end/gemini-smoke.eval.ts`) skips on PR runs because the `GEMINI_API_KEY` secret is unavailable to forks. A nightly workflow (`.github/workflows/nightly-evals.yml`) runs the same eval against the real key — auth failures (revoked / expired key) surface as `auth_failed: true` and fail the job loudly rather than skipping silently.

## Forbidden patterns

- Hardcoded UI in the runtime that bypasses manifests
- Direct database access from components (always go through capabilities)
- Inline LLM calls during render (compile, cache, render — never inline)
- Storing user intent inside the app's own database
- Auto-executing destructive actions without explicit user confirmation
- "Helpful" UI mutations the user didn't request

## When in doubt

Read the ethos. The ten principles answer 90% of design questions.
The remaining 10% deserve a design discussion, not an agent decision.
