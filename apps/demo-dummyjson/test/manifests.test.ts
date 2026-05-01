// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Lens-driven manifest builder. Each lens density resolves to a distinct
 * manifest layout (List vs 3-col Grid vs 2-col Grid) for the same /browse
 * route. Plus shape sanity for the other routes.
 */

import { describe, expect, it } from 'vitest';
import { ManifestSchema } from '@cir/schemas';
import {
  browseManifest,
  cartManifest,
  checkoutManifest,
  manifestForRoute,
  productManifest,
} from '../lib/manifests';

function findFirst(node: unknown, componentName: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (obj['component'] === componentName) return obj;
  const children = obj['children'];
  if (Array.isArray(children)) {
    for (const c of children) {
      const found = findFirst(c, componentName);
      if (found !== null) return found;
    }
  }
  return null;
}

describe('manifestForRoute', () => {
  it('returns three distinct browse layouts across the three lenses', () => {
    const compact = manifestForRoute('/browse', 'compact');
    const cozy = manifestForRoute('/browse', 'comfortable');
    const spacious = manifestForRoute('/browse', 'spacious');
    expect(compact).not.toBeNull();
    expect(cozy).not.toBeNull();
    expect(spacious).not.toBeNull();

    // Compact is a List; cozy / spacious are Grids.
    const compactLayout = compact!.routes[0]!.layout!;
    const cozyLayout = cozy!.routes[0]!.layout!;
    const spaciousLayout = spacious!.routes[0]!.layout!;
    expect(findFirst(compactLayout, 'List')).not.toBeNull();
    expect(findFirst(cozyLayout, 'Grid')).not.toBeNull();
    expect(findFirst(spaciousLayout, 'Grid')).not.toBeNull();

    // Cozy is 3 columns; spacious is 2 columns.
    expect((findFirst(cozyLayout, 'Grid') as { props: { columns: number } }).props.columns).toBe(3);
    expect(
      (findFirst(spaciousLayout, 'Grid') as { props: { columns: number } }).props.columns,
    ).toBe(2);
  });

  it('every variant validates against ManifestSchema', () => {
    for (const density of ['compact', 'comfortable', 'spacious'] as const) {
      const browse = browseManifest(density);
      const product = productManifest('1', density);
      const cart = cartManifest(density);
      const checkout = checkoutManifest(density);
      expect(ManifestSchema.safeParse(browse).success).toBe(true);
      expect(ManifestSchema.safeParse(product).success).toBe(true);
      expect(ManifestSchema.safeParse(cart).success).toBe(true);
      expect(ManifestSchema.safeParse(checkout).success).toBe(true);
    }
  });

  it('returns null for an unknown route', () => {
    expect(manifestForRoute('/nope', 'comfortable')).toBeNull();
  });

  it('routes / through to /browse', () => {
    const m = manifestForRoute('/', 'comfortable');
    expect(m).not.toBeNull();
    expect(m!.routes[0]!.path).toBe('/browse');
  });

  it('cart manifest exposes selectable list with bulk-remove', () => {
    const m = cartManifest('comfortable')!;
    const list = findFirst(m.routes[0]!.layout!, 'List');
    expect(list).not.toBeNull();
    const props = list!['props'] as { selectable?: boolean; bulkActions?: { id: string }[] };
    expect(props.selectable).toBe(true);
    expect(props.bulkActions?.[0]?.id).toBe('dummyjson.cart.remove');
  });

  it('browse manifest in cozy mode exposes a grid bulk action bar (HoverCard wiring smoke)', () => {
    const m = browseManifest('comfortable')!;
    const grid = findFirst(m.routes[0]!.layout!, 'Grid');
    expect(grid).not.toBeNull();
    const props = grid!['props'] as { selectable?: boolean; bulkActions?: { id: string }[] };
    expect(props.selectable).toBe(true);
    expect(props.bulkActions?.length ?? 0).toBeGreaterThan(0);
  });

  it('product detail manifest references the recommendations capability', () => {
    const m = productManifest('15', 'comfortable')!;
    const recList = findFirst(m.routes[0]!.layout!, 'List');
    expect(recList).not.toBeNull();
    const data = recList!['data'] as { source: string; filter: string };
    expect(data.source).toBe('dummyjson.product.recommendations');
    expect(data.filter).toContain('15');
  });

  it('checkout manifest exercises Wizard variant=sidebar', () => {
    const m = checkoutManifest('comfortable')!;
    const wiz = findFirst(m.routes[0]!.layout!, 'Wizard');
    expect(wiz).not.toBeNull();
    expect((wiz!['props'] as { variant: string }).variant).toBe('sidebar');
    expect((wiz!['props'] as { steps: unknown[] }).steps).toHaveLength(3);
  });
});
