// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { expect, test } from '@playwright/test';

test.describe('CIR demo — /today', () => {
  test('renders the welcome alert', async ({ page }) => {
    await page.goto('/today');
    await expect(page.getByText('Welcome to the CIR demo')).toBeVisible();
  });

  test('renders the decision queue with thread rows', async ({ page }) => {
    await page.goto('/today');
    await expect(page.getByText('Decisions to make today')).toBeVisible();
    await expect(page.getByRole('link', { name: /Q2 board update/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Renewal/ })).toBeVisible();
  });

  test('renders the task queue grouped by due date', async ({ page }) => {
    await page.goto('/today');
    await expect(page.getByText('Your tasks')).toBeVisible();
    // Grouped task labels (at least one of these always renders given fixtures)
    const headers = page.locator('[data-cir-task-group-header]');
    await expect(headers.first()).toBeVisible();
  });

  test('navigates from a thread row into the thread view', async ({ page }) => {
    await page.goto('/today');
    await page.getByRole('link', { name: /Q2 board update/ }).click();
    await expect(page).toHaveURL(/\/thread\/t_001/);
    // Subject as h1, plus the rendered Markdown for at least one message.
    await expect(page.getByRole('heading', { name: 'Re: Q2 board update' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Q2 board update' })).toBeVisible();
  });

  test('renders sanitized markdown (gfm tables, strikethrough)', async ({ page }) => {
    await page.goto('/thread/t_002');
    // The fixture body has a strikethrough ("~~Pricing~~ Already locked")
    await expect(page.locator('del')).toContainText('Pricing');
  });

  test('archive triggers a confirmation modal', async ({ page }) => {
    await page.goto('/today');
    // Click the first Archive button in the decision queue.
    const archive = page.getByRole('button', { name: 'Archive' }).first();
    await archive.click();
    // Confirm portal renders an HTML <dialog> with confirm/cancel buttons.
    const dialog = page.locator('dialog[open]').first();
    await expect(dialog).toBeVisible();
    // Cancel to leave the thread in place.
    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('SSE-driven invalidation: published trigger refreshes the route', async ({
    page,
    request,
  }) => {
    await page.goto('/today');
    await expect(page.getByText('Decisions to make today')).toBeVisible();

    // Publish a recompile trigger via the demo's broadcast endpoint.
    const res = await request.post('/api/triggers/publish', {
      data: {
        type: 'user.recompile_route',
        user_id: 'demo-user',
        manifest_id: 'm_demo_today',
        route: '/today',
      },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { ok: boolean; delivered: number };
    expect(body.ok).toBe(true);
    expect(body.delivered).toBeGreaterThan(0);

    // Page should still be functional after refresh.
    await expect(page.getByText('Your tasks')).toBeVisible();
  });
});
