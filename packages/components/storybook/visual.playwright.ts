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

test('component catalog exposes a usable ActionMenu fixture', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=components-catalog--all-components&viewMode=story&globals=designSystem:neutral',
  );

  const actionMenuCard = page.locator('[data-cir-story-id="ActionMenu"]');
  await expect(actionMenuCard).toHaveCount(1);

  await expect(actionMenuCard.locator('[data-cir-part="action-menu-trigger"]')).toHaveText(
    'Actions',
  );
  await actionMenuCard.locator('[data-cir-part="action-menu-trigger"]').click();

  await expect(page.locator('[data-cir-part="action-menu-list"]')).toBeVisible();
  await expect(
    page.locator('[data-cir-part="action-menu-item"]', { hasText: 'Approve' }),
  ).toBeVisible();
  await expect(
    page.locator('[data-cir-part="action-menu-item"]', { hasText: 'Assign' }),
  ).toBeVisible();
  await expect(
    page.locator('[data-cir-part="action-menu-item"]', { hasText: 'Escalate' }),
  ).toBeVisible();
});

test('interaction primitives story exercises Radix-backed surfaces', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=components-catalog--interaction-primitives&viewMode=story&globals=designSystem:neutral',
  );

  await page.locator('[data-cir-part="action-menu-trigger"]').click();
  await page.locator('[data-cir-part="action-menu-item"]', { hasText: 'Assign' }).click();
  await expect(page.locator('[data-cir-last-action]')).toHaveText('Last action: Assign');

  await page.locator('[data-cir-open-modal]').click();
  await expect(page.getByRole('dialog', { name: 'Manifest details' })).toBeVisible();
  await expect(page.getByText('Validated at resolver.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Manifest details' })).toHaveCount(0);

  await page.locator('[data-cir-open-drawer]').click();
  await expect(page.getByRole('dialog', { name: 'Customer context' })).toBeVisible();
  await expect(page.getByText('Recent activity')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Customer context' })).toHaveCount(0);
});
