# packages/

The **pnpm workspace root.** All publishable packages live here, one per directory. The workspace is wired in [`../pnpm-workspace.yaml`](../pnpm-workspace.yaml) (`packages: ['packages/*']`).

## Packages

| Package           | Status  | Purpose                                                                                                                                                                                                                                                       |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cir/schemas`    | shipped | Zod schemas + generated JSON Schemas for capabilities, skills, manifests, brand kits, etc.                                                                                                                                                                    |
| `@cir/policies`   | shipped | Pure-function validators consumed by the compiler and runtime (7 baseline policies + `PolicyRegistry` for app-supplied additions)                                                                                                                             |
| `@cir/evals`      | shipped | Eval harness, `defineEval()` helper, and `cir-evals` CLI                                                                                                                                                                                                      |
| `@cir/runtime`    | shipped | The framework-agnostic render SDK: manifest cache/fetcher/resolver, action dispatcher (confirm — including `verbal_required` voice-phrase match — + LRU undo), trigger bus + invalidation wiring, component/action registries, `buildRenderPlan`, audit sink. |
| `@cir/components` | shipped | Runtime implementations of the 56-component baseline catalog                                                                                                                                                                                                  |
| `@cir/react`      | shipped | React adapter: `<CirRuntime>` provider, `<CirRoute>` walker, hooks, confirm portal, stale-while-revalidate + optimistic UI primitives                                                                                                                         |
| `@cir/compiler`   | shipped | LLM-backed compile service: Gemini integration, `ManifestStore` (Memory + Redis), `FallbackCompiler`                                                                                                                                                          |
| `@cir/cli`        | planned | Developer CLI: scaffold capabilities, run evals, publish registries                                                                                                                                                                                           |

## Conventions

- One package per directory. Directory name matches the unscoped package name (`runtime/`, `compiler/`, `schemas/`, etc.).
- Each package owns its own `package.json`, `tsconfig.json` (extending [`../tsconfig.base.json`](../tsconfig.base.json)), `src/`, and tests.
- Cross-package imports use the workspace protocol (`"@cir/schemas": "workspace:*"`).
- Public packages publish under the `@cir` scope.
- Source files use `.ts` extensions and import each other directly via the package name (no build step required for tests; the workspace `main`/`exports` point at `src/`).

## Background

See [`../docs/architecture.md`](../docs/architecture.md) for the service decomposition each package implements, and [`../docs/build-plan.md`](../docs/build-plan.md) for when each one is expected to land.
