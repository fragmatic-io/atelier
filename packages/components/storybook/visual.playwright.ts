// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { expect, test } from '@playwright/test';

const BRAND_EXPECTATIONS = [
  { id: 'neutral', brand: 'atelier.design.neutral', accent: '#2563eb' },
  { id: 'commerce', brand: 'atelier.design.commerce', accent: '#ff5f3a' },
  { id: 'console', brand: 'atelier.design.console', accent: '#38bdf8' },
] as const;

for (const brand of BRAND_EXPECTATIONS) {
  test(`component catalog renders unobstructed with ${brand.id} design system`, async ({
    page,
  }) => {
    await page.goto(
      `/iframe.html?id=components-catalog--all-components&viewMode=story&globals=designSystem:${brand.id}`,
    );
    await expect(page.locator('[data-atelier-brand]')).toHaveAttribute(
      'data-atelier-brand',
      brand.brand,
    );
    await expect(page.locator('[data-cir-story-card]')).toHaveCount(83);
    await expect(page.locator('[data-cir-story-error]')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByPlaceholder('Type a command...')).toHaveCount(0);

    const accent = await page
      .locator('[data-atelier-brand]')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--atelier-accent-primary').trim());
    expect(accent).toBe(brand.accent);

    const screenshot = await page.locator('[data-cir-story-root]').screenshot({
      animations: 'disabled',
    });
    expect(screenshot.byteLength).toBeGreaterThan(25_000);
  });
}
