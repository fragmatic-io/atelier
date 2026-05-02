// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Per-app Vitest config — adds the `@/*` path alias the Next.js
 * `tsconfig.json` declares so test modules can resolve component imports
 * the same way the dev server does. Without this, transitive imports
 * through `lib/component-bindings.ts → components/*.tsx → @/lib/*` fail
 * with `Failed to load url @/lib/...` because the root `vitest.config.ts`
 * at the repo level does not define the alias.
 *
 * The repo root config is the source of truth for everything else
 * (coverage thresholds, includes, exclusions); this config does NOT
 * inherit it because Vitest at the time of this writing does not have a
 * stable workspace-config inheritance pattern. The `pnpm test` runner
 * runs from the repo root which uses the root config; `pnpm --filter
 * @atelier/demo-github test` runs from this directory and uses this config.
 */

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.{test,spec}.{ts,tsx}'],
  },
});
