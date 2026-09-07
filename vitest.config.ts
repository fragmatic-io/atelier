// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { defineConfig } from 'vitest/config';

/**
 * Atelier root Vitest configuration.
 *
 * Workspace-aware: picks up *.test.ts / *.spec.ts under packages/ (schemas,
 * policies, evals, runtime, compiler) and the top-level scripts/ harness
 * directory.
 *
 * Eval files (evals/**\/*.eval.ts) are intentionally NOT matched here — they
 * will be driven by a dedicated eval runner (see docs/production-concerns.md
 * "Evals" section). When that runner lands, point it at evals/ and keep this
 * config focused on unit/integration tests.
 *
 * Coverage thresholds are tuned per package via the per-glob thresholds map
 * below. New packages start at 0% and ratchet up as source lands. The repo-wide
 * floor is the lowest acceptable bar; per-package overrides ratchet stricter
 * packages individually.
 *
 * Ratchet policy (Phase 5b, Gap G):
 *  - Each per-package threshold sits at roughly `current measured - 1%`, so
 *    a small drop doesn't break CI but real regressions do.
 *  - Files that are intentionally untested at this phase (debug overlays,
 *    observability streaming, partially-implemented baseline policies, the
 *    fresh @atelier/compiler package) are excluded from `coverage.include` rather
 *    than dragging package aggregates below the ratchet. Each exclusion
 *    carries a comment naming the phase that should re-include it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./scripts/test/vitest-browser-storage-compat.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.husky/**',
      '**/.git/**',
      '**/.claude/worktrees/**',
      // apps/* is product code (Next.js demo, etc.); we don't unit-test
      // page components here. The Playwright suite under `apps/demo/e2e/`
      // covers route flows. The `apps/demo/test/` slot is allowed (and
      // matched via `include` above) for pure helper modules like
      // `lib/intent-store.ts`.
      'apps/demo/app/**',
      'apps/demo/components/**',
      'apps/demo/e2e/**',
      'apps/demo/lib/**',
      'apps/demo/.next/**',
    ],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // Repo-wide floor — kept low so unrelated work is not blocked. Per-package
      // thresholds (below) apply stricter bars to specific packages.
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
        // @atelier/schemas: schemas are nearly all declarative.
        // 2026-05-04: branches dropped 95→74 after view-definition + app-outline
        // + marketplace-review schemas landed without paired branch coverage.
        // 2026-05-04 ratchet-back-up: re-tested marketplace canonicalEncode
        // (function/symbol/undefined branches) + skill-parser non-YAMLException
        // and missing-mark fallbacks; branches climb to ~96. Lock the original
        // 95 bar back in. P0 ratchet item: closed.
        'packages/schemas/src/**/*.ts': {
          lines: 99,
          functions: 95,
          branches: 95,
          statements: 99,
        },
        // @atelier/policies: pure-function validators. The base set lands at
        // 96–100% once the partially-implemented `respects_brand_kit` policy
        // is excluded (see exclusions below). Ratchet to lock that in.
        'packages/policies/src/**/*.ts': {
          lines: 97,
          functions: 97,
          branches: 95,
          statements: 97,
        },
        // @atelier/evals: orchestration with CLI + reporters; harder to fully cover
        // without spawning real processes for every flag combo. Brief said
        // leave at 90/90/80/90 (still maturing) — measured ~94/100/88/94.
        'packages/evals/src/**/*.ts': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
        // @atelier/runtime: orchestration (cache + fetch + dispatch + bus).
        // 2026-05-04: drops to 91/90/85/91 after S-4 distributed TriggerBus
        // + P0.5a Zod hardening. 2026-05-04 ratchet-back-up: added
        // rate-limiter unit tests (file 0→100%), sse-trigger-transport unit
        // suite covering publish + subscribe error branches, and registry
        // helper coverage. Aggregate climbed; thresholds raised back to
        // 95/95/87/95. Lines/statements 1pp below original (96), branches
        // 1pp below original (88). P0 ratchet item: closed.
        'packages/runtime/src/**/*.ts': {
          lines: 95,
          functions: 95,
          branches: 87,
          statements: 95,
        },
        // @atelier/components: React components with happy-dom tests.
        // 2026-05-04: drops to 93/88/84/93 after the catalog grew 65→83.
        // 2026-05-04 ratchet-back-up: added detect-language coverage in
        // src/lib (61→96), tightening the per-package aggregate to
        // ~93.6/91/85.2/93.6 (lines/functions/branches/statements). Bumped
        // branches +1 to 85 (matches the original); lines/statements held
        // at 93 (still 2pp below the original 95) because individual
        // components in the 65→83 expansion still have a few unhit variant
        // branches. Wave 11 polish closes the rest.
        'packages/components/src/**/*.{ts,tsx}': {
          lines: 93,
          functions: 88,
          branches: 85,
          statements: 93,
        },
        // @atelier/react: provider, hooks, render walker, confirm portal.
        // 2026-05-04: drops to 87/90/84/87 after Cnt-10 useSavedView, Cnt-11
        // useAutosave + useVersionHistory landed. 2026-05-04 ratchet-back-up:
        // added focused tests for the previously untested Int-1 motion
        // hooks (use-data-pulse, use-shimmer-on-change, use-tween-number)
        // plus deepCopy/randomUUID fallback paths in useVersionHistory.
        // hooks subdir climbed 85.1→93.93/82.45/91.76. Thresholds raised
        // to 92/90/84/92 — lines/statements 2pp below original (94),
        // branches matched at 84 (still 4pp below original 88, since
        // saved-view URL-parse branches are not yet exercised). P0 ratchet
        // item: closed for lines/statements; remainder tracked under Wave
        // 11 polish (saved-view branches, undoable-dispatch error paths).
        'packages/react/src/**/*.{ts,tsx}': {
          lines: 92,
          functions: 90,
          branches: 84,
          statements: 92,
        },
        // @atelier/compiler: first unit-test pass landed (Phase 5c).
        // 2026-05-04: drops to 80/91/81/80 after C-3/C-4/C-5 landed. The
        // package's lines/statements were dragged hardest by zero-coverage
        // helper files (BudgetMeter class, generic-fallback compiler,
        // gemini-agent-client, composite-compiler budget integration paths,
        // gemini-compiler policyFixGuidance retry messages).
        // 2026-05-04 ratchet-back-up: filled all of the above. Aggregate
        // climbed to 96.65/86.78/99.27/96.65 (lines/branches/functions/
        // statements). Thresholds raised to 95/94/86/95 — lines/statements
        // back to original 95, branches now ABOVE original (81→86),
        // functions 1pp below original (95). P0 ratchet item: closed.
        'packages/compiler/src/**/*.ts': {
          lines: 95,
          functions: 94,
          branches: 86,
          statements: 95,
        },
        // @atelier/cli (Wave 2 / track P2.5; Wave 4 P-CLI-2 added inspect,
        // compile, and dev --tail): scaffold + shell-out wrappers + the
        // unit-testable parsing/loading seams of the new commands.
        // Templates and pure shell-out wrappers (dev.ts, validate.ts,
        // components-sync.ts) are excluded from coverage.include below.
        // Aggregate measured ~85/73/93/85; ratchet ~2 down so a small drop
        // doesn't break CI but real regressions do.
        'packages/cli/src/**/*.ts': {
          lines: 83,
          functions: 90,
          branches: 70,
          statements: 83,
        },
        // @atelier/data-resolvers (Wave 6 / track P-2): pure-function adapters
        // (REST, OpenAPI, GraphQL, Mock, Composite) + a SWR cache wrapper +
        // a small filter parser. Aggregate measured ~99/91/100/99. Branches
        // are dragged a bit by `openapi.ts`'s `exactOptionalPropertyTypes`
        // spread guards (each `x !== undefined ? { x } : {}` is two branches);
        // ratchet branches to 80 so we lock that in without false positives.
        'packages/data-resolvers/src/**/*.ts': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
      },
      include: ['packages/**/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/dist/**',
        '**/node_modules/**',
        '**/*.d.ts',
        // CLI subdirectories of the schemas/evals packages — those CLIs are
        // tested via spawned subprocess specs (see packages/evals/test/cli.test.ts)
        // rather than unit tests, so v8 reports 0% line coverage and would
        // drag aggregates below their per-file ratchets. The standalone
        // @atelier/cli package (packages/cli/) is unit-tested directly and stays
        // included.
        'packages/schemas/src/cli/**',
        'packages/evals/src/cli/**',
        // Re-export barrels and types-only modules carry no executable code;
        // v8 reports 0% which skews the aggregate below per-file thresholds.
        '**/index.ts',
        '**/{result,types}.ts',
        // `render/plan-types.ts` is a types-only module that escapes the
        // `{result,types}.ts` glob above (different filename shape).
        'packages/runtime/src/render/plan-types.ts',
        // Phase 4d streaming audit sink — no test harness lands until the
        // SSE-paired streaming smoke spec in Phase 5c.
        'packages/runtime/src/audit/streaming.ts',
        // Phase 4d debug overlays (compile badge + debug panel). Visual-only
        // dev tooling; tests follow when Phase 5c adds the inspector
        // integration suite.
        'packages/react/src/debug/**',
        // Brand-kit baseline policy is partially implemented — only the
        // detection scaffold is wired; rule evaluation lands in Phase 5b/c.
        'packages/policies/src/baseline/respects_brand_kit.ts',
        // @atelier/cli scaffold: inline templates are pure data (no executable
        // logic worth measuring) and dev/components-sync are shell-out
        // wrappers that can't be unit-tested without spawning real
        // pnpm/next/tsx subprocesses. Re-include in Wave 3+ if we add an
        // integration suite.
        // Note: `validate.ts` was excluded for the same reason in Wave 2,
        // but Sprint 1.2 reimplemented it as a real validator with
        // `lib/run-validators/`; it is unit-tested via fixtures (see
        // `packages/cli/test/validate.test.ts`). The runner files that
        // spawn `tsc`/`eslint`/the test script are integration-tested
        // via fixtures — their spawn helper branches are excluded as
        // they rely on real tooling presence.
        'packages/cli/src/templates/**',
        'packages/cli/src/commands/dev.ts',
        'packages/cli/src/commands/components-sync.ts',
        'packages/cli/src/lib/run-validators/typescript.ts',
        'packages/cli/src/lib/run-validators/eslint.ts',
        'packages/cli/src/lib/run-validators/vitest.ts',
      ],
    },
  },
});
