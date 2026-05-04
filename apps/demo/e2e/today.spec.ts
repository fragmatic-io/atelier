// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { expect, test, type Page } from '@playwright/test';
import { buildDemoProfile, INTENT_STORAGE_KEY } from '../lib/intent-store';

const seededProfile = buildDemoProfile(['lens.today', 'lens.thread', 'vocabulary.read']);

async function seedIntent(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, profile }) => {
      window.localStorage.setItem(key, JSON.stringify(profile));
    },
    { key: INTENT_STORAGE_KEY, profile: seededProfile },
  );
}

test.describe('Atelier demo — dynamic route smoke', () => {
  test('renders the intent grant screen', async ({ page }) => {
    await page.goto('/onboarding');

    await expect(
      page.getByRole('heading', { name: 'This app is asking to read your intent profile' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grant all' })).toBeVisible();
  });

  test('renders parameterized routes through the same manifest path', async ({ page }) => {
    await seedIntent(page);
    await page.goto('/thread/t_002');

    await expect(page.locator('[data-cir-route="/thread/t_002"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'T 002' })).toBeVisible();
    await expect(page.getByText('Generic fallback served')).toBeVisible();
  });

  test('SSE-driven invalidation keeps the route renderable after refresh', async ({
    page,
    request,
  }) => {
    await seedIntent(page);
    await page.goto('/thread/t_002');
    await expect(page.locator('[data-cir-route="/thread/t_002"]')).toBeVisible();

    const res = await request.post('/api/triggers/publish', {
      data: {
        type: 'user.recompile_route',
        user_id: 'demo-user',
        manifest_id: 'm_demo_thread',
        route: '/thread/t_002',
      },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { ok: boolean; delivered: number };
    expect(body.ok).toBe(true);
    expect(body.delivered).toBeGreaterThan(0);

    await expect(page.locator('[data-cir-route="/thread/t_002"]')).toBeVisible();
  });
});
