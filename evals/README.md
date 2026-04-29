# evals/

**Test cases for every artifact.** Capabilities, skills, components, manifests, recipes, and end-to-end flows. A CIR system with weak evals produces weird interfaces and erodes trust; a CIR system with strong evals can iterate fast on the compiler without breaking users.

## Layout

```
evals/
├── capabilities/{name}.eval.ts     # input validation, side-effect checks, permission enforcement
├── skills/{name}.eval.ts           # given a scenario, does the skill emit the expected capability sequence?
├── components/{name}.eval.ts       # render, a11y, breakpoint, interaction tests
├── manifests/{scenario}.eval.ts    # compile + policy-check + structural assertions
├── recipes/{persona}.eval.ts       # recipe + representative intent compiles to a valid manifest
└── e2e/{flow}.eval.ts              # intent → manifest → render → action → audit
```

- **Naming**: `*.eval.ts` (eval cases) — distinct from `*.test.ts` (unit/integration tests run by vitest).

## Background

See [`../docs/production-concerns.md`](../docs/production-concerns.md) — section "Evals" for the full taxonomy and the trigger schedule (every capability change, every component change, every skill change, every compiler model upgrade, daily on production samples).

## Runner

> **Important:** vitest is configured to pick up `*.test.ts` only. Eval files use the `*.eval.ts` extension and **will get a dedicated runner later** (the eval harness is its own service per the architecture diagram). Until then, eval files are the source of truth for what the harness will execute — keep them as plain TypeScript with explicit assertions, no vitest globals.

## Adding an eval

1. Place the file in the matching subdirectory.
2. Export named scenarios; each scenario is a record of `{ input, expect, rationale }`.
3. Cover at least: the happy path, one boundary case, one adversarial case.
4. For policy-touching evals, include the expected `policy_evaluations` trace.
5. Reference the artifact's version explicitly so old evals don't silently follow a schema bump.

## Status

Empty in Phase 1; populated starting in **Phase 2 (schemas)** alongside the first capabilities. Phase 3 of the build plan calls for **100+ eval cases**.
