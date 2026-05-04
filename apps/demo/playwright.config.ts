// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the demo. The webServer block boots `next dev` on
 * port 3100 (off the standard 3000 to avoid collision with a user's running
 * instance) and waits for `/today` to respond before tests start.
 *
 * Run locally: `pnpm --filter @atelier/demo e2e`
 * Browser binary needs `pnpm --filter @atelier/demo exec playwright install chromium`
 * once per machine. CI installs Chromium and runs this deterministic smoke
 * with GEMINI_API_KEY cleared so route reality is covered without secrets.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm exec next dev -p 3100',
    url: 'http://127.0.0.1:3100/today',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: {
      GEMINI_API_KEY: '',
      ATELIER_COMPILER_TOOLS: 'off',
      ATELIER_RECIPE_RAG: 'off',
    },
  },
});
