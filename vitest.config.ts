import { defineConfig } from 'vitest/config';

/**
 * CIR root Vitest configuration.
 *
 * Workspace-aware: picks up *.test.ts / *.spec.ts under packages/, runtime/,
 * compiler/, policies/, and the top-level scripts/ harness directory.
 *
 * Eval files (evals/**\/*.eval.ts) are intentionally NOT matched here — they
 * will be driven by a dedicated eval runner (see docs/production-concerns.md
 * "Evals" section). When that runner lands, point it at evals/ and keep this
 * config focused on unit/integration tests.
 *
 * Coverage thresholds are 0% during Phase 1 bootstrap. Bump them in the
 * `coverage.thresholds` block below as the codebase grows.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'coverage', '.husky'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
      include: [
        'packages/**/src/**/*.ts',
        'runtime/**/*.ts',
        'compiler/**/*.ts',
        'policies/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/dist/**', '**/node_modules/**', '**/*.d.ts'],
    },
  },
});
