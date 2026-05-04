// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('component catalog story renders and stays accessible', async ({ page }) => {
  await page.goto('/iframe.html?id=components-catalog--all-components&viewMode=story');
  await expect(page.locator('[data-cir-story-card]')).toHaveCount(83);
  await expect(page.locator('[data-cir-story-error]')).toHaveCount(0);

  const screenshot = await page.locator('[data-cir-story-root]').screenshot({
    animations: 'disabled',
  });
  expect(screenshot.byteLength).toBeGreaterThan(25_000);

  const results = await new AxeBuilder({ page })
    .include('[data-cir-story-root]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
