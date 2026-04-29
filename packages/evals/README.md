# @cir/evals

Eval harness for CIR. Discovers `*.eval.ts` files, executes their scenarios, and reports pass/fail. **Not a unit-test runner** — vitest owns `*.test.ts`. Evals are end-to-end scenarios that check whether the compiler produces the expected manifest given an intent + capability set.

For the framework taxonomy and trigger schedule see [`docs/production-concerns.md`](../../docs/production-concerns.md) §"Evals".

## The five kinds

| Kind         | What it covers                                                           |
| ------------ | ------------------------------------------------------------------------ |
| `capability` | Input validation, side-effect declarations, permission enforcement.      |
| `skill`      | Given a scenario, does the skill emit the expected capability sequence?  |
| `component`  | Render, a11y, breakpoint, interaction tests.                             |
| `manifest`   | Compile + policy-check + structural assertions on the produced manifest. |
| `end-to-end` | Intent → manifest → render → action → audit.                             |

## Authoring

Eval files use the `*.eval.ts` extension and live under `evals/`. Each file exports one or more `defineEval(...)` results — default export, named exports, or arrays — and the runner harvests every spec it can find.

```ts
// evals/capabilities/email-triage.eval.ts
import { defineEval } from '@cir/evals';

export default defineEval({
  id: 'capability/email-triage/marks-action-required',
  description: 'Triage flags emails containing "URGENT" as action_required.',
  kind: 'capability',
  tags: ['email', 'p1'],
  input: { subject: 'URGENT: server down' },
  run: async (input) => triage(input),
  expected: { state: 'action_required' },
});
```

`expected` may be a literal (compared with `node:util.isDeepStrictEqual` by default) or a predicate `(output) => boolean | Promise<boolean>`. Override comparison with `compare`.

Per-spec knobs: `timeoutMs` (default 10s), `skip: 'reason'`, `todo: 'reason'`, `tags: [...]`.

## CLI

```sh
pnpm exec cir-evals run                        # discover and run every eval
pnpm exec cir-evals run --kind capability      # filter by kind (repeatable)
pnpm exec cir-evals run --tag email --tag p1   # filter by tag (any-match)
pnpm exec cir-evals run --filter triage        # filter by id substring
pnpm exec cir-evals run --reporter json        # NDJSON for CI tooling
pnpm exec cir-evals run --concurrency 4        # parallel execution
pnpm exec cir-evals run --timeout 30000        # per-eval timeout (ms)
pnpm exec cir-evals run --pattern 'evals/capabilities/**/*.eval.ts'
```

Exit code is `0` when every eval passes, skips, or is marked todo; `1` if any fail, error, or time out. An empty result set (filter matched nothing) exits `0`.

## Programmatic

```ts
import { runEvals, ConsoleReporter } from '@cir/evals';

const summary = await runEvals(
  process.cwd(),
  { kinds: ['capability'] },
  {
    onResult: (r) => ConsoleReporter.onResult(r),
  },
);
process.exit(summary.failed === 0 ? 0 : 1);
```

## Status

Phase 3 ships the harness. Phase 5 lands the 100+ scenarios called out in [`docs/build-plan.md`](../../docs/build-plan.md).
