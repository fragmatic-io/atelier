// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
// @vitest-environment happy-dom
/**
 * End-to-end personalisation test.
 *
 * Wave 6 P-1 promised that personalisation signals from the intent profile
 * actually reach rendered components. This test pins the contract by:
 *
 *   1. Building services with an `IntentProfile` whose
 *      `global_preferences.density === 'compact'`.
 *   2. Rendering a manifest containing a `Card` with no `density` prop set.
 *   3. Asserting the rendered Card surfaces the compact spacing — both the
 *      `data-density="compact"` attribute and the smaller body padding the
 *      component derives from it.
 *
 * Uses the real `Card` from `@cir/components` so this is genuinely an E2E
 * pass through the schema, the walker, and the component.
 */
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { IntentProfile } from '@cir/schemas';
import { CardBinding } from '@cir/components';
import { MapComponentRegistry } from '@cir/runtime/testing';
import { CirRuntime } from '../src/context/runtime-provider.js';
import { CirRoute } from '../src/render/route.js';
import { buildTestServices } from '../src/testing/build-test-services.js';
import { makeManifest } from './fixtures.js';

function intentWithDensity(density: 'compact' | 'comfortable' | 'spacious'): IntentProfile {
  return {
    user_id: 'test-user',
    profile_version: 1,
    updated_at: '2026-04-29T12:00:00Z',
    global_preferences: { density },
    lenses: {},
    rules: [],
    vocabulary: {},
  };
}

describe('personalisation: intent.global_preferences → rendered component', () => {
  it('threads density="compact" from intent into a Card without an explicit prop', async () => {
    const registry = new MapComponentRegistry({ Card: CardBinding });
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: {
        '/today': makeManifest({
          routes: [
            {
              path: '/today',
              title: 'Today',
              layout: { component: 'Card', children: [] },
            },
          ],
        }),
      },
    });
    services.intent = intentWithDensity('compact');

    const { container } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" />
      </CirRuntime>,
    );
    await waitFor(() => {
      const card = container.querySelector('section[data-cir-component="Card"]');
      expect(card).not.toBeNull();
    });

    const card = container.querySelector('section[data-cir-component="Card"]') as HTMLElement;
    expect(card.getAttribute('data-density')).toBe('compact');

    // The body padding shrinks at compact density (the canonical value comes
    // from `DENSITY_PADDING_PX.compact`). We assert it's STRICTLY LESS than
    // the default comfortable value to keep the test resilient to future
    // numeric tweaks.
    const body = container.querySelector<HTMLElement>('[data-cir-part="card-body"]');
    expect(body).not.toBeNull();
    const compactPad = parseInt(body!.style.padding, 10);
    expect(Number.isFinite(compactPad)).toBe(true);
    expect(compactPad).toBeLessThan(12);
  });

  it('falls back to comfortable spacing when no intent profile is provided', async () => {
    const registry = new MapComponentRegistry({ Card: CardBinding });
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: {
        '/today': makeManifest({
          routes: [
            {
              path: '/today',
              title: 'Today',
              layout: { component: 'Card', children: [] },
            },
          ],
        }),
      },
    });
    // Intent intentionally NOT set — we want to exercise the default path.

    const { container } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" />
      </CirRuntime>,
    );
    await waitFor(() => {
      const card = container.querySelector('section[data-cir-component="Card"]');
      expect(card).not.toBeNull();
    });

    const card = container.querySelector('section[data-cir-component="Card"]') as HTMLElement;
    expect(card.getAttribute('data-density')).toBe('comfortable');
  });
});
