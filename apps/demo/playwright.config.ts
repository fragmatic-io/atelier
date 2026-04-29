// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the demo. The webServer block boots `next dev` on
 * port 3100 (off the standard 3000 to avoid collision with a user's running
 * instance) and waits for `/today` to respond before tests start.
 *
 * Run locally: `pnpm --filter @cir/demo e2e`
 * Browser binary needs `pnpm --filter @cir/demo exec playwright install chromium`
 * once per machine; we don't run E2E in CI in Phase 4d (would require either
 * caching the browser binary or accepting a ~3min download per CI run).
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
    command: 'pnpm dev -- -p 3100',
    url: 'http://127.0.0.1:3100/today',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
