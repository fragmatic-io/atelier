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

vitest is configured to pick up `*.test.ts` only. Eval files use the `*.eval.ts` extension and run through the dedicated harness shipped in [`@cir/evals`](../packages/evals/README.md):

```sh
pnpm exec cir-evals run                        # discover and run every eval
pnpm exec cir-evals run --kind capability      # filter by kind
pnpm exec cir-evals run --filter email-triage  # filter by id substring
pnpm exec cir-evals run --reporter json        # NDJSON for CI
```

The repo also exposes `pnpm evals` as a shortcut for `cir-evals run` against the workspace root. The harness is **not** wired into `pnpm validate` yet — that gate flips on once enough scenarios have landed for the suite to be load-bearing.

## Adding an eval

1. Place the file in the matching subdirectory with the `*.eval.ts` extension.
2. Export `defineEval({ ... })` (default export, named exports, and arrays of specs are all picked up).
3. Set `kind` to one of `capability | skill | component | manifest | end-to-end`.
4. Cover at least: the happy path, one boundary case, one adversarial case.
5. For policy-touching evals, assert against the expected `policy_evaluations` trace.
6. Reference the artifact's version explicitly so old evals don't silently follow a schema bump.

```ts
import { defineEval } from '@cir/evals';

export default defineEval({
  id: 'capability/email-triage/marks-action-required',
  description: 'Triage flags emails containing "URGENT" as action_required.',
  kind: 'capability',
  input: { subject: 'URGENT: server down' },
  run: async (input) => triage(input),
  expected: { state: 'action_required' },
});
```

## Status

Phase 3 ships the [`@cir/evals`](../packages/evals/README.md) harness, the `cir-evals` CLI, and one sanity case (`example.eval.ts`) so the runner stays green. The 100+ scenario set called for in [`../docs/build-plan.md`](../docs/build-plan.md) lands in Phase 5 alongside capability/skill/component source. The harness is **not** wired into `pnpm validate` yet — that gate flips on once the suite is load-bearing.
