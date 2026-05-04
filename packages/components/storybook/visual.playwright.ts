// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { expect, test } from '@playwright/test';

test('component catalog story renders without fixture errors or blocking overlays', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=components-catalog--all-components&viewMode=story');
  await expect(page.locator('[data-cir-story-card]')).toHaveCount(83);
  await expect(page.locator('[data-cir-story-error]')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByPlaceholder('Type a command...')).toHaveCount(0);

  const screenshot = await page.locator('[data-cir-story-root]').screenshot({
    animations: 'disabled',
  });
  expect(screenshot.byteLength).toBeGreaterThan(25_000);
});
