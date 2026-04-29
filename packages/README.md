# packages/

The **pnpm workspace root.** All publishable packages live here, one per directory. The workspace is wired in [`../pnpm-workspace.yaml`](../pnpm-workspace.yaml) (`packages: ['packages/*']`).

## Packages

| Package           | Status                         | Purpose                                                                        |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `@cir/schemas`    | **Phase 2** — schemas-first    | Zod schemas + generated JSON Schemas for capabilities, skills, manifests, etc. |
| `@cir/runtime`    | Stub (Phase 2); source Phase 5 | The render SDK (web first; native/voice later)                                 |
| `@cir/compiler`   | Stub (Phase 2); source Phase 5 | The LLM-backed compile service                                                 |
| `@cir/components` | Phase 5                        | Runtime implementations of the 50-primitive baseline catalog                   |
| `@cir/policies`   | Phase 3                        | Pure-function validators consumed by the compiler and runtime                  |
| `@cir/cli`        | Phase 5                        | Developer CLI: scaffold capabilities, run evals, publish registries            |
| `@cir/evals`      | Phase 3                        | Eval harness and shared fixtures                                               |

## Conventions

- One package per directory. Directory name matches the unscoped package name (`runtime/`, `compiler/`, `schemas/`, etc.).
- Each package owns its own `package.json`, `tsconfig.json` (extending [`../tsconfig.base.json`](../tsconfig.base.json)), `src/`, and tests.
- Cross-package imports use the workspace protocol (`"@cir/schemas": "workspace:*"`).
- Public packages publish under the `@cir` scope.
- Source files use `.ts` extensions and import each other directly via the package name (no build step required for tests; the workspace `main`/`exports` point at `src/`).

## Background

See [`../docs/architecture.md`](../docs/architecture.md) for the service decomposition each package implements, and [`../docs/build-plan.md`](../docs/build-plan.md) for when each one is expected to land.
