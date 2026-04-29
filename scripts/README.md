# scripts/

Repo-level harness scripts and the test harness sanity check. Tests in this directory are run by Vitest. Real product tests live in their respective packages under `packages/*` and in `evals/`.

## Files

- `sanity.test.ts` — proves Vitest is wired up and discovers tests outside `packages/`.
- `check-license-headers.ts` — verifies every in-scope source file starts with the SPDX MIT header. Wired into `pnpm validate` via the `check:license-headers` script. Run with `--fix` (`pnpm fix:license-headers`) to prepend missing headers. The matcher also accepts `Apache-2.0` so a relicense in flight stays green.

Add new scripts here only when they are repo-wide harness concerns. Per-package scripts belong inside the package they serve.
