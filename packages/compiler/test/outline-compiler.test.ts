// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `DeterministicOutlineCompiler` — Wave C / Phase C-4.
 *
 * Covers the four load-bearing semantics of the deterministic baseline:
 *  - NavBar built from sorted-by-`order` routes (ties broken by `routeId`).
 *  - StatusBar pinned bottom of the chrome stack.
 *  - `commonPolicies` = intersection across all routes' `policyIds`.
 *  - `skillStack` = union across all routes' `skillIds`, deduped + sorted.
 */

import { describe, expect, it } from 'vitest';
import {
  AppOutlineSchema,
  type AppOutline,
  type LayoutNode,
  type NavEntry,
} from '@atelier/schemas';
import { DeterministicOutlineCompiler, type OutlineRouteInput } from '../src/outline-compiler.js';

function makeRoute(overrides: Partial<OutlineRouteInput> & { id: string }): OutlineRouteInput {
  return {
    label: undefined,
    icon: undefined,
    order: undefined,
    policyIds: undefined,
    skillIds: undefined,
    intent: undefined,
    ...overrides,
  } as OutlineRouteInput;
}

describe('DeterministicOutlineCompiler', () => {
  it('produces a schema-valid AppOutline', async () => {
    const c = new DeterministicOutlineCompiler();
    const outline = await c.compileOutline({
      routes: [
        makeRoute({ id: 'today', label: 'Today', order: 0 }),
        makeRoute({ id: 'inbox', label: 'Inbox', order: 1 }),
      ],
      brandKitId: 'demo-brand',
    });

    expect(() => AppOutlineSchema.parse(outline)).not.toThrow();
    expect(outline.brandKitId).toBe('demo-brand');
  });

  it('exposes a stable id', () => {
    expect(new DeterministicOutlineCompiler().id).toBe('outline-deterministic');
  });

  describe('nav', () => {
    it('builds entries from routes sorted by order', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [
          makeRoute({ id: 'inbox', label: 'Inbox', order: 2 }),
          makeRoute({ id: 'today', label: 'Today', order: 0 }),
          makeRoute({ id: 'archive', label: 'Archive', order: 1 }),
        ],
        brandKitId: 'demo-brand',
      });

      expect(outline.nav.map((n) => n.routeId)).toEqual(['today', 'archive', 'inbox']);
    });

    it('breaks ties by routeId lexicographically', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [
          makeRoute({ id: 'beta', order: 1 }),
          makeRoute({ id: 'alpha', order: 1 }),
          makeRoute({ id: 'gamma', order: 0 }),
        ],
        brandKitId: 'demo-brand',
      });

      expect(outline.nav.map((n) => n.routeId)).toEqual(['gamma', 'alpha', 'beta']);
    });

    it('defaults order to the route input index when omitted', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [
          makeRoute({ id: 'first' }),
          makeRoute({ id: 'second' }),
          makeRoute({ id: 'third' }),
        ],
        brandKitId: 'demo-brand',
      });

      expect(outline.nav).toEqual<NavEntry[]>([
        { routeId: 'first', label: 'First', order: 0 },
        { routeId: 'second', label: 'Second', order: 1 },
        { routeId: 'third', label: 'Third', order: 2 },
      ]);
    });

    it('defaults label to a humanized form of the id', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [makeRoute({ id: 'today-priorities' })],
        brandKitId: 'demo-brand',
      });
      expect(outline.nav[0]?.label).toBe('Today priorities');
    });

    it('threads icon when provided', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [makeRoute({ id: 'inbox', icon: 'inbox' })],
        brandKitId: 'demo-brand',
      });
      expect(outline.nav[0]?.icon).toBe('inbox');
    });

    it('omits icon when not provided (does not surface as undefined)', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [makeRoute({ id: 'inbox' })],
        brandKitId: 'demo-brand',
      });
      expect(outline.nav[0]).not.toHaveProperty('icon');
    });
  });

  describe('chrome', () => {
    it('produces Stack(Logo, NavBar, StatusBar) with StatusBar last', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [makeRoute({ id: 'today' })],
        brandKitId: 'demo-brand',
      });

      expect(outline.chrome.component).toBe('Stack');
      const children = outline.chrome.children ?? [];
      expect(children.map((c2: LayoutNode) => c2.component)).toEqual([
        'Logo',
        'NavBar',
        'StatusBar',
      ]);
      // StatusBar pinned bottom = LAST child of the stack.
      expect(children[children.length - 1]?.component).toBe('StatusBar');
    });

    it('threads nav entries onto the NavBar items prop', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [makeRoute({ id: 'today', order: 0 }), makeRoute({ id: 'inbox', order: 1 })],
        brandKitId: 'demo-brand',
      });

      const navBar = outline.chrome.children?.find((c2: LayoutNode) => c2.component === 'NavBar');
      expect(navBar?.props?.['items']).toEqual(outline.nav);
    });
  });

  describe('commonPolicies', () => {
    it('intersects per-route declarations', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [
          makeRoute({ id: 'today', policyIds: ['data_access', 'brand_kit', 'reversibility'] }),
          makeRoute({ id: 'inbox', policyIds: ['data_access', 'brand_kit'] }),
          makeRoute({ id: 'archive', policyIds: ['data_access', 'brand_kit', 'rate_limited'] }),
        ],
        brandKitId: 'demo-brand',
      });

      expect(outline.commonPolicies).toEqual(['brand_kit', 'data_access']);
    });

    it('returns empty when one route declares no policies', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [
          makeRoute({ id: 'today', policyIds: ['data_access'] }),
          makeRoute({ id: 'inbox' }), // no policyIds
        ],
        brandKitId: 'demo-brand',
      });
      expect(outline.commonPolicies).toEqual([]);
    });

    it('returns empty for zero routes', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({ routes: [], brandKitId: 'demo-brand' });
      expect(outline.commonPolicies).toEqual([]);
    });

    it('sorts the intersection lexicographically for stability', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [
          makeRoute({ id: 'today', policyIds: ['z_policy', 'a_policy', 'm_policy'] }),
          makeRoute({ id: 'inbox', policyIds: ['m_policy', 'z_policy', 'a_policy'] }),
        ],
        brandKitId: 'demo-brand',
      });

      expect(outline.commonPolicies).toEqual(['a_policy', 'm_policy', 'z_policy']);
    });
  });

  describe('skillStack', () => {
    it('unions skill ids and dedupes', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [
          makeRoute({ id: 'today', skillIds: ['email-triage', 'inbox-zero'] }),
          makeRoute({ id: 'inbox', skillIds: ['inbox-zero', 'reply-fast'] }),
          makeRoute({ id: 'archive', skillIds: ['email-triage'] }),
        ],
        brandKitId: 'demo-brand',
      });

      expect(outline.skillStack).toEqual(['email-triage', 'inbox-zero', 'reply-fast']);
    });

    it('sorts the union lexicographically', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [makeRoute({ id: 'today', skillIds: ['zebra', 'apple', 'mango'] })],
        brandKitId: 'demo-brand',
      });

      expect(outline.skillStack).toEqual(['apple', 'mango', 'zebra']);
    });

    it('returns empty when no route declares skills', async () => {
      const c = new DeterministicOutlineCompiler();
      const outline = await c.compileOutline({
        routes: [makeRoute({ id: 'today' }), makeRoute({ id: 'inbox' })],
        brandKitId: 'demo-brand',
      });
      expect(outline.skillStack).toEqual([]);
    });
  });

  it('threads brandKitId through to the outline', async () => {
    const c = new DeterministicOutlineCompiler();
    const outline: AppOutline = await c.compileOutline({
      routes: [makeRoute({ id: 'today' })],
      brandKitId: 'aurora-v3',
    });
    expect(outline.brandKitId).toBe('aurora-v3');
  });
});
