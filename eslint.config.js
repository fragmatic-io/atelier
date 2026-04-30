// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
// ESLint 9 flat config for CIR.
// Project is "type": "module", so this file is ESM.
// Uses typescript-eslint's helper to compose recommended-type-checked rules
// with project-service-driven type information from tsconfig.base.json.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // Global ignores. These directories either contain non-code data,
  // generated output, or files owned by other tooling.
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.claude/worktrees/**',
      '**/*.d.ts',
      'pnpm-lock.yaml',
      '.husky/_/**',
      'docs/**',
      'capabilities/**',
      'skills/**',
      'recipes/**',
      '.well-known/**',
      // Next.js build output and auto-generated files in the demo app.
      'apps/*/.next/**',
      'apps/*/next-env.d.ts',
      // The demo app uses its own tsconfig (not extending the workspace base);
      // type-aware lint with `projectService` doesn't find these files in the
      // root tsconfig and would error. Next.js validates them itself.
      'apps/**',
    ],
  },

  // ESLint core recommended rules — applies to all files.
  js.configs.recommended,

  // Type-aware TypeScript rules. projectService lets typescript-eslint
  // discover the right tsconfig per file without an explicit project list.
  ...tseslint.configs.recommendedTypeChecked,

  // TypeScript-specific configuration: parser options and rule tuning.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Plain JS/MJS/CJS files: Node globals, no type-aware linting.
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    // Disable type-aware rules for plain JS — they require a TS program.
    ...tseslint.configs.disableTypeChecked,
  },

  // Prettier MUST be last to disable any stylistic rules that conflict
  // with the formatter.
  prettier,
);
