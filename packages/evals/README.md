# @atelier/evals

Eval harness for Atelier. Discovers `*.eval.ts` files, executes their scenarios, and reports pass/fail. **Not a unit-test runner** — vitest owns `*.test.ts`. Evals are end-to-end scenarios that check whether the compiler produces the expected manifest given an intent + capability set.

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
import { defineEval } from '@atelier/evals';

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
pnpm exec atelier-evals run                        # discover and run every eval
pnpm exec atelier-evals run --kind capability      # filter by kind (repeatable)
pnpm exec atelier-evals run --tag email --tag p1   # filter by tag (any-match)
pnpm exec atelier-evals run --filter triage        # filter by id substring
pnpm exec atelier-evals run --reporter json        # NDJSON for CI tooling
pnpm exec atelier-evals run --concurrency 4        # parallel execution
pnpm exec atelier-evals run --timeout 30000        # per-eval timeout (ms)
pnpm exec atelier-evals run --pattern 'evals/capabilities/**/*.eval.ts'
```

Exit code is `0` when every eval passes, skips, or is marked todo; `1` if any fail, error, or time out. An empty result set (filter matched nothing) exits `0`.

## Programmatic

```ts
import { runEvals, ConsoleReporter } from '@atelier/evals';

const summary = await runEvals(
  process.cwd(),
  { kinds: ['capability'] },
  {
    onResult: (r) => ConsoleReporter.onResult(r),
  },
);
process.exit(summary.failed === 0 ? 0 : 1);
```

## Smoke evals + nightly Gemini

The repo ships an end-to-end Gemini smoke (`evals/end-to-end/gemini-smoke.eval.ts`) tagged `smoke`. It runs when `GEMINI_API_KEY` is set; otherwise it skips. PR CI never has the secret and skips silently. The nightly workflow at `.github/workflows/nightly-evals.yml` runs the same eval against the real key, and crucially distinguishes auth failures (revoked / invalid key) from a missing key — auth failures surface as `auth_failed: true` and fail the job loudly. A silent skip on a revoked key would be a regression, not a pass.

```sh
pnpm exec atelier-evals run --tag smoke   # local smoke run; requires GEMINI_API_KEY
```

## Status

Harness shipped, plus capability / manifest / skill / end-to-end scenario coverage against the demo (see [`../../evals/README.md`](../../evals/README.md)). The 100+ scenario set from [`docs/build-plan.md`](../../docs/build-plan.md) continues to grow; the harness is not yet a `pnpm validate` gate, but does run in CI via the nightly Gemini job.
