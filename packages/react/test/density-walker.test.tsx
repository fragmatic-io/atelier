// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
/**
 * Wave 11 / Vis-6 — render walker emits `data-cir-density` on the route's
 * outermost wrapper AND threads the resolved density through to every
 * density-aware component.
 *
 * Pins three contracts:
 *
 *   1. The route walker calls `resolveDensity(intent, path)` once and
 *      surfaces the result on `[data-cir-route] [data-cir-density]`.
 *   2. `density_overrides` take precedence over `global_preferences.density`
 *      for matching routes.
 *   3. Density-aware components nested inside the route receive the SAME
 *      effective value as the wrapper (no per-component re-resolution).
 *
 * Uses real `Card` and `Stack` bindings so this is genuinely an E2E pass
 * through the schema, the density resolver, the walker, and the
 * components.
 */
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { IntentProfile } from '@atelier/schemas';
import { CardBinding, StackBinding } from '@atelier/components';
import { MapComponentRegistry } from '@atelier/runtime/testing';
import { CirRuntime } from '../src/context/runtime-provider.js';
import { CirRoute } from '../src/render/route.js';
import { buildTestServices } from '../src/testing/build-test-services.js';
import { makeManifest } from './fixtures.js';

function intentWith(overrides: Partial<IntentProfile>): IntentProfile {
  return {
    user_id: 'test-user',
    profile_version: 1,
    updated_at: '2026-05-02T00:00:00Z',
    global_preferences: {},
    lenses: {},
    rules: [],
    vocabulary: {},
    ...overrides,
  };
}

describe('Vis-6 — render walker emits data-cir-density on outermost wrapper', () => {
  it('emits data-cir-density on the route wrapper from global_preferences.density', async () => {
    const registry = new MapComponentRegistry({ Card: CardBinding, Stack: StackBinding });
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: {
        '/today': makeManifest({
          routes: [
            {
              path: '/today',
              title: 'Today',
              layout: { component: 'Stack', children: [] },
            },
          ],
        }),
      },
    });
    services.intent = intentWith({ global_preferences: { density: 'compact' } });

    const { container } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" />
      </CirRuntime>,
    );

    await waitFor(() => {
      const wrap = container.querySelector('[data-cir-route="/today"]');
      expect(wrap).not.toBeNull();
    });

    const wrap = container.querySelector('[data-cir-route="/today"]') as HTMLElement;
    expect(wrap.getAttribute('data-cir-density')).toBe('compact');
  });

  it('emits the framework default when no intent is provided', async () => {
    const registry = new MapComponentRegistry({ Card: CardBinding, Stack: StackBinding });
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

    const { container } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" />
      </CirRuntime>,
    );
    await waitFor(() => {
      const wrap = container.querySelector('[data-cir-route="/today"]');
      expect(wrap).not.toBeNull();
    });
    const wrap = container.querySelector('[data-cir-route="/today"]') as HTMLElement;
    expect(wrap.getAttribute('data-cir-density')).toBe('comfortable');
  });

  it('per-surface override takes precedence over global preference', async () => {
    const registry = new MapComponentRegistry({ Card: CardBinding, Stack: StackBinding });
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: {
        '/admin/queues': makeManifest({
          routes: [
            {
              path: '/admin/queues',
              title: 'Admin queues',
              layout: { component: 'Stack', children: [{ component: 'Card', children: [] }] },
            },
          ],
        }),
      },
    });
    services.intent = intentWith({
      global_preferences: { density: 'comfortable' },
      density_overrides: [
        { route_pattern: '/admin/*', density: 'compact', reason: 'admin power-user surface' },
      ],
    });

    const { container } = render(
      <CirRuntime services={services}>
        <CirRoute path="/admin/queues" />
      </CirRuntime>,
    );
    await waitFor(() => {
      const wrap = container.querySelector('[data-cir-route="/admin/queues"]');
      expect(wrap).not.toBeNull();
    });

    // Wrapper carries the override.
    const wrap = container.querySelector('[data-cir-route="/admin/queues"]') as HTMLElement;
    expect(wrap.getAttribute('data-cir-density')).toBe('compact');

    // Stack and Card, both density-aware, surface the same effective value.
    const stack = container.querySelector('[data-cir-component="Stack"]') as HTMLElement;
    expect(stack.getAttribute('data-cir-density')).toBe('compact');
    expect(stack.getAttribute('data-density')).toBe('compact');

    const card = container.querySelector('[data-cir-component="Card"]') as HTMLElement;
    expect(card.getAttribute('data-cir-density')).toBe('compact');
    expect(card.getAttribute('data-density')).toBe('compact');
  });

  it('non-matching override falls through to the global preference', async () => {
    const registry = new MapComponentRegistry({ Card: CardBinding, Stack: StackBinding });
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: {
        '/today': makeManifest({
          routes: [
            {
              path: '/today',
              title: 'Today',
              layout: { component: 'Stack', children: [] },
            },
          ],
        }),
      },
    });
    services.intent = intentWith({
      global_preferences: { density: 'spacious' },
      density_overrides: [{ route_pattern: '/admin/*', density: 'compact' }],
    });

    const { container } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" />
      </CirRuntime>,
    );
    await waitFor(() => {
      const wrap = container.querySelector('[data-cir-route="/today"]');
      expect(wrap).not.toBeNull();
    });

    const wrap = container.querySelector('[data-cir-route="/today"]') as HTMLElement;
    expect(wrap.getAttribute('data-cir-density')).toBe('spacious');

    const stack = container.querySelector('[data-cir-component="Stack"]') as HTMLElement;
    expect(stack.getAttribute('data-cir-density')).toBe('spacious');
  });

  it('manifest-supplied density on a node still wins over the walker default', async () => {
    const registry = new MapComponentRegistry({ Stack: StackBinding });
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: {
        '/today': makeManifest({
          routes: [
            {
              path: '/today',
              title: 'Today',
              layout: { component: 'Stack', props: { density: 'spacious' }, children: [] },
            },
          ],
        }),
      },
    });
    // User's global preference is compact — but the manifest authored
    // `density: 'spacious'` on this node specifically.
    services.intent = intentWith({ global_preferences: { density: 'compact' } });

    const { container } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" />
      </CirRuntime>,
    );
    await waitFor(() => {
      const stack = container.querySelector('[data-cir-component="Stack"]');
      expect(stack).not.toBeNull();
    });

    // The route wrapper still surfaces the resolved (intent-driven) value …
    const wrap = container.querySelector('[data-cir-route="/today"]') as HTMLElement;
    expect(wrap.getAttribute('data-cir-density')).toBe('compact');

    // … while the explicit per-node prop wins on the component itself.
    const stack = container.querySelector('[data-cir-component="Stack"]') as HTMLElement;
    expect(stack.getAttribute('data-cir-density')).toBe('spacious');
  });
});
