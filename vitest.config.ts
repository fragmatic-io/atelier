// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { defineConfig } from 'vitest/config';

/**
 * CIR root Vitest configuration.
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
 *    fresh @cir/compiler package) are excluded from `coverage.include` rather
 *    than dragging package aggregates below the ratchet. Each exclusion
 *    carries a comment naming the phase that should re-include it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.husky/**',
      '**/.git/**',
      // apps/* is product code (Next.js demo, etc.); not unit-tested at this layer.
      'apps/**',
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
        // @cir/schemas: schemas are nearly all declarative and now reach 100%
        // across every dimension. Ratchet aggressively — anything below this
        // means a new schema landed without tests.
        'packages/schemas/src/**/*.ts': {
          lines: 99,
          functions: 95,
          branches: 95,
          statements: 99,
        },
        // @cir/policies: pure-function validators. The base set lands at
        // 96–100% once the partially-implemented `respects_brand_kit` policy
        // is excluded (see exclusions below). Ratchet to lock that in.
        'packages/policies/src/**/*.ts': {
          lines: 97,
          functions: 97,
          branches: 95,
          statements: 97,
        },
        // @cir/evals: orchestration with CLI + reporters; harder to fully cover
        // without spawning real processes for every flag combo. Brief said
        // leave at 90/90/80/90 (still maturing) — measured ~94/100/88/94.
        'packages/evals/src/**/*.ts': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
        // @cir/runtime: orchestration (cache + fetch + dispatch + bus). With
        // `audit/streaming.ts` (Phase 4d streaming sink, no harness yet) and
        // `render/plan-types.ts` (types-only) excluded below, the rest of the
        // package sits at 97–100%. Ratchet without dragging.
        'packages/runtime/src/**/*.ts': {
          lines: 96,
          functions: 90,
          branches: 88,
          statements: 96,
        },
        // @cir/components: React components with happy-dom tests. Aggregates
        // ~98/100/87/98 with the suite shipped in 4b. Ratchet branches up
        // moderately (variant `className` ternaries are individually covered
        // by their default path; both branches are not always hit).
        'packages/components/src/**/*.{ts,tsx}': {
          lines: 95,
          functions: 95,
          branches: 85,
          statements: 95,
        },
        // @cir/react: provider, hooks, render walker, confirm portal. The
        // giant trigger-type switch in `route.tsx` adds many shallow branches
        // and pulls overall branch coverage down a few points. With the debug
        // overlays excluded (Phase 4d additions, untested), the rest of the
        // package is ~95/100/90/95.
        'packages/react/src/**/*.{ts,tsx}': {
          lines: 94,
          functions: 95,
          branches: 88,
          statements: 94,
        },
        // @cir/compiler: first unit-test pass landed (Phase 5c). Six new test
        // files cover GeminiCompiler (with an inline GoogleGenAI fake),
        // FallbackCompiler, CompositeCompiler, MemoryManifestStore,
        // ServerManifestResolver, and the prompt builder. Aggregate measured
        // ~97.9/86.45/100/97.9; ratchet to roughly measured-2/-5/-5/-2 so
        // small drops do not break CI but real regressions do.
        'packages/compiler/src/**/*.ts': {
          lines: 95,
          functions: 95,
          branches: 81,
          statements: 95,
        },
        // @cir/cli (Wave 2 / track P2.5): scaffold for `cir init`, `cir add`,
        // and shell-out wrappers for dev/validate/components-sync. Modest
        // bars — most of the package is shell-out glue. Templates and
        // shell-out wrappers are excluded from coverage.include below.
        'packages/cli/src/**/*.ts': {
          lines: 75,
          functions: 75,
          branches: 70,
          statements: 75,
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
        // @cir/cli package (packages/cli/) is unit-tested directly and stays
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
        // @cir/cli scaffold: inline templates are pure data (no executable
        // logic worth measuring) and dev/validate/components-sync are
        // shell-out wrappers that can't be unit-tested without spawning real
        // pnpm/next/tsx subprocesses. Re-include in Wave 3+ if we add an
        // integration suite.
        'packages/cli/src/templates/**',
        'packages/cli/src/commands/dev.ts',
        'packages/cli/src/commands/validate.ts',
        'packages/cli/src/commands/components-sync.ts',
      ],
    },
  },
});
