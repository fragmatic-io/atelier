// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Sprint 2.3 — compiled-workflow visual gate (Playwright spec).
 *
 * For each of the 3 operational composites (`ApprovalCommandCenter`,
 * `CustomerContextPanel`, `ExceptionReviewWorkbench`):
 *
 *   1. Read the persona fixture from `./workflows/persona-fixtures/<name>.persona.json`.
 *   2. Compile it via `compileWorkflowViaLlm()` — real Gemini call, gated
 *      on `process.env.GEMINI_API_KEY`. Without a key, the test is
 *      `test.skip()`'d (so this gate is a neutral no-op on PRs that lack
 *      the secret).
 *   3. Render the produced `Manifest` to a complete HTML document via
 *      `renderManifestToHtml()`.
 *   4. Load the document into the Playwright page via `page.setContent`.
 *   5. `expect(page).toHaveScreenshot(...)` against the committed
 *      baseline at `__compiled-workflow-baselines/<workflow>-1280x720.baseline.png`.
 *
 * Run with `pnpm --filter @atelier/components storybook:visual:compiled`.
 * Update the baselines (intentional regen) with
 * `pnpm --filter @atelier/components storybook:visual:compiled:update-baselines`.
 */

import { expect, test } from '@playwright/test';
import {
  compileWorkflowViaLlm,
  getWorkflowPersona,
  renderManifestToHtml,
  WORKFLOW_PERSONA_NAMES,
} from './workflows/index.js';

const apiKey = process.env['GEMINI_API_KEY'];

for (const workflowName of WORKFLOW_PERSONA_NAMES) {
  test(`compiled workflow visual: ${workflowName}`, async ({ page }) => {
    // Sprint 2.3 contract: the gate is neutral without a Gemini key. The
    // base storybook visual gate (visual.playwright.ts) keeps covering the
    // hand-authored stories; this gate only fires when CI provides
    // `secrets.GEMINI_API_KEY` (or a developer sets it locally).
    test.skip(!apiKey, 'GEMINI_API_KEY not set; compiled-workflow visual gate skipped.');

    const persona = getWorkflowPersona(workflowName);

    // Compile via the real LLM.
    const manifest = await compileWorkflowViaLlm(workflowName, { apiKey });

    // Render to a static HTML document.
    const html = renderManifestToHtml(manifest, {
      route: persona.route,
      brandKitId: persona.brand_kit_id,
      title: persona.title,
    });

    // Load into the page. Using setContent (instead of a data URL) so
    // relative resources (none today, but future-proof) resolve to the
    // page's origin and not `data:`.
    await page.setContent(html, { waitUntil: 'load' });

    // Assert the surface mounted (catches a rendering regression earlier
    // than the screenshot would).
    await expect(page.locator('[data-cir-compiled-workflow]')).toBeVisible();

    // Screenshot diff against the committed baseline. The 5% threshold
    // lives in `playwright.compiled-workflows.config.ts`'s
    // `toHaveScreenshot` defaults so all three workflows share it.
    await expect(page).toHaveScreenshot(`${workflowName}-1280x720.baseline.png`, {
      animations: 'disabled',
      fullPage: false,
    });
  });
}
