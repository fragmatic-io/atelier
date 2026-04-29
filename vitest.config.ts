// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
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
 * Coverage thresholds are tuned per package via the `perFile` thresholds map
 * below. New packages start at 0% and ratchet up as source lands. The repo-wide
 * floor is the lowest acceptable bar; per-file overrides ratchet stricter
 * packages individually.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.husky/**', '**/.git/**'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // Repo-wide floor — kept low so unrelated work is not blocked. Per-file
      // thresholds (below) apply stricter bars to specific packages.
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
        // @cir/schemas: schemas are nearly all declarative. Anything that drops
        // below this floor likely means a new schema was added without tests.
        // Functions threshold is lower because v8 attributes per-callback
        // functions inside zod's `.refine()` chains; the real declarative
        // coverage is captured by lines/statements/branches.
        'packages/schemas/src/**/*.ts': {
          lines: 95,
          functions: 50,
          branches: 80,
          statements: 95,
        },
        // @cir/policies: pure-function validators. Easy to cover well; demand it.
        'packages/policies/src/**/*.ts': {
          lines: 95,
          functions: 95,
          branches: 90,
          statements: 95,
        },
        // @cir/evals: orchestration with CLI + reporters; harder to fully cover
        // without spawning real processes for every flag combo. Set a sensible
        // bar that's already met and ratchet up as the harness grows.
        'packages/evals/src/**/*.ts': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
      },
      include: ['packages/**/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/dist/**',
        '**/node_modules/**',
        '**/*.d.ts',
        '**/cli/**',
        // Re-export barrels and types-only modules carry no executable code;
        // v8 reports 0% which skews the aggregate below per-file thresholds.
        '**/index.ts',
        '**/{result,types}.ts',
      ],
    },
  },
});
