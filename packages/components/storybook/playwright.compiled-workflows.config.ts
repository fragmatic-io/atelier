// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Sprint 2.3 — compiled-workflow visual gate.
 *
 * Distinct config from `playwright.config.ts` (the base catalog gate) because
 * this gate:
 *   - has no Storybook web server dependency (we render manifests to static
 *     HTML and load them via `data:` URLs / `page.setContent`),
 *   - runs at a fixed 1280×720 viewport so screenshot diffs against the
 *     committed baselines are deterministic,
 *   - lives behind `GEMINI_API_KEY` — without it the spec marks every test
 *     `test.skip()`, so the gate is neutral on PRs without the secret,
 *   - has a longer per-test timeout because each test executes a real LLM
 *     compile (≈10–30 s on Gemini 2.5 Pro for the persona shapes we ship).
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['compiled-workflows.playwright.ts'],
  // Real LLM compile + render + screenshot. 3 minutes is generous; keeps
  // the gate safe against transient Gemini latency without disguising real
  // hangs.
  timeout: 180_000,
  expect: {
    timeout: 30_000,
    // 5% pixel-diff threshold per Sprint 2.3 spec. Relaxed enough to absorb
    // sub-pixel font-rendering jitter across runners; tight enough that a
    // genuine layout regression (a panel disappears, columns swap) trips it.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05,
      // Pin the snapshot directory so update-baselines and CI both write
      // to / compare against the same on-disk path.
      pathTemplate: '{testDir}/__compiled-workflow-baselines/{arg}{ext}',
    },
  },
  // No retries — a real-LLM compile that fails once should fail loudly so
  // the cost regression / prompt drift is visible. CI surfaces the diff
  // artifacts on failure.
  retries: 0,
  // Run serially: each test does its own LLM compile, and parallel calls
  // to Gemini will both incur the latency floor and risk hitting per-key
  // rate limits.
  workers: 1,
  use: {
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-1280x720',
      // Fixed viewport so screenshot diffs are deterministic — the
      // baselines under `__compiled-workflow-baselines/` are pinned to
      // this exact size.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
  ],
});
