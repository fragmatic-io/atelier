# packages/

The **pnpm workspace root.** All publishable packages live here, one per directory. The workspace is wired in [`../pnpm-workspace.yaml`](../pnpm-workspace.yaml) (`packages: ['packages/*']`).

## Packages

| Package               | Status  | Purpose                                                                                                                                                                                                                                                       |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@atelier/schemas`    | shipped | Zod schemas + generated JSON Schemas for capabilities, skills, manifests, brand kits, etc.                                                                                                                                                                    |
| `@atelier/policies`   | shipped | Pure-function validators consumed by the compiler and runtime (10 baseline policies + `PolicyRegistry` for app-supplied additions)                                                                                                                            |
| `@atelier/evals`      | shipped | Eval harness, `defineEval()` helper, and `atelier-evals` CLI                                                                                                                                                                                                  |
| `@atelier/runtime`    | shipped | The framework-agnostic render SDK: manifest cache/fetcher/resolver, action dispatcher (confirm — including `verbal_required` voice-phrase match — + LRU undo), trigger bus + invalidation wiring, component/action registries, `buildRenderPlan`, audit sink. |
| `@atelier/components` | shipped | Runtime implementations of the 83-component baseline catalog                                                                                                                                                                                                  |
| `@atelier/react`      | shipped | React adapter: `<CirRuntime>` provider, `<CirRoute>` walker, hooks, confirm portal, stale-while-revalidate + optimistic UI primitives                                                                                                                         |
| `@atelier/compiler`   | shipped | LLM-backed compile service: `GeminiCompiler`, `ToolUsingCompiler`, validation provenance, central manifest policy validation, `ManifestStore` (Memory + Redis), `ServerManifestResolver`, `StreamingAuditSink`                                                |
| `@atelier/cli`        | shipped | Unified developer CLI (`atelier init / dev / add / components-sync / validate / import openapi / inspect / compile / vault / marketplace`), with `--tail` for terminal-side audit observability                                                               |

## Conventions

- One package per directory. Directory name matches the unscoped package name (`runtime/`, `compiler/`, `schemas/`, etc.).
- Each package owns its own `package.json`, `tsconfig.json` (extending [`../tsconfig.base.json`](../tsconfig.base.json)), `src/`, and tests.
- Cross-package imports use the workspace protocol (`"@atelier/schemas": "workspace:*"`).
- Public packages publish under the `@atelier` scope.
- Source files use `.ts` extensions, but public package contracts resolve through built `dist/` artifacts. Run `pnpm build` before typecheck/tests when changing package exports; `pnpm validate` does this automatically.
- Each publishable package uses the same artifact shape: ESM `dist/index.js`, `dist/index.d.ts`, `exports["."].default`, `exports["."].types`, and a `files` allowlist that includes `dist`, `src`, `README.md`, and `CHANGELOG.md`.

## Background

See [`../docs/architecture.md`](../docs/architecture.md) for the service decomposition each package implements. The phased build history (how the framework actually came together) lives in [`../docs/build-plan.md`](../docs/build-plan.md).
