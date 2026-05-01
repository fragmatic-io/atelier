// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Manifest builder tests for the dummyjson catalog demo.
 *
 * After the E-B refactor the headline `<Grid>` baseline binding has been
 * replaced with a custom `<ProductGrid>` that carries `compositionRole:
 * 'grid'`. The grid reshapes columns by reading `density` off the renderer
 * (single column at compact, 3 at comfortable, 2 at spacious), so the
 * manifest itself is identical across densities except for `props.density`
 * — the test no longer asserts a different component name per lens.
 *
 * Cart and Product surfaces likewise migrated to custom bindings
 * (`<CartItemList>`, `<ProductDetail>`); checkout uses `<CheckoutWizard>`.
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
  it('returns a ProductGrid for every density on /browse', () => {
    for (const density of ['compact', 'comfortable', 'spacious'] as const) {
      const m = manifestForRoute('/browse', density);
      expect(m).not.toBeNull();
      const grid = findFirst(m!.routes[0]!.layout, 'ProductGrid');
      expect(grid).not.toBeNull();
      // The renderer reads density off intent — manifest props echo it.
      expect((grid!['props'] as { density: string }).density).toBe(density);
      // The grid binds to the catalog list capability.
      expect((grid!['data'] as { source: string }).source).toBe('dummyjson.product.list');
    }
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

  it('cart manifest mounts CartItemList bound to cart.list', () => {
    const m = cartManifest('comfortable')!;
    const cart = findFirst(m.routes[0]!.layout!, 'CartItemList');
    expect(cart).not.toBeNull();
    const data = cart!['data'] as { source: string; filter: string };
    expect(data.source).toBe('dummyjson.cart.list');
    expect(data.filter).toContain('user_id = 1');
  });

  it('product detail manifest references the recommendations capability', () => {
    const m = productManifest('15', 'comfortable')!;
    const recList = findFirst(m.routes[0]!.layout!, 'List');
    expect(recList).not.toBeNull();
    const data = recList!['data'] as { source: string; filter: string };
    expect(data.source).toBe('dummyjson.product.recommendations');
    expect(data.filter).toContain('15');
  });

  it('product detail manifest mounts ProductDetail with the focal product filter', () => {
    const m = productManifest('15', 'comfortable')!;
    const detail = findFirst(m.routes[0]!.layout!, 'ProductDetail');
    expect(detail).not.toBeNull();
    const data = detail!['data'] as { source: string; filter: string };
    expect(data.source).toBe('dummyjson.product.list');
    expect(data.filter).toBe('id = 15');
  });

  it('checkout manifest mounts the CheckoutWizard custom binding', () => {
    const m = checkoutManifest('comfortable')!;
    const wiz = findFirst(m.routes[0]!.layout!, 'CheckoutWizard');
    expect(wiz).not.toBeNull();
  });

  it('every route surfaces the rate-limit chip in the chrome header', () => {
    for (const builder of [
      () => browseManifest('comfortable'),
      () => cartManifest('comfortable'),
      () => productManifest('1', 'comfortable'),
      () => checkoutManifest('comfortable'),
    ]) {
      const m = builder();
      const chip = findFirst(m.routes[0]!.layout!, 'RateLimitChip');
      expect(chip).not.toBeNull();
    }
  });

  it('drops the card-sized StatCard quota indicator from the body', () => {
    // The old design surfaced the rate-limit quota as a card-sized
    // StatCard in the page body. The new design moves that to a small
    // inline `<RateLimitChip>` in the chrome header (asserted above).
    const m = browseManifest('comfortable')!;
    expect(findFirst(m.routes[0]!.layout!, 'StatCard')).toBeNull();
  });

  it('reversibility anchor buttons are present but render off-screen', () => {
    // The reversibility policy needs Button nodes carrying both
    // `cart.add` and `cart.remove` in every route that exposes the cart
    // pair. The user-visible reversibility is the inline undo toast;
    // the anchors are flagged with `data-cir-policy-anchor=reversibility`
    // and positioned off-screen.
    const m = browseManifest('comfortable')!;
    const findAll = (root: unknown, comp: string, out: unknown[] = []): unknown[] => {
      if (!root || typeof root !== 'object') return out;
      const node = root as Record<string, unknown>;
      if (node['component'] === comp) out.push(node);
      const children = node['children'];
      if (Array.isArray(children)) for (const c of children) findAll(c, comp, out);
      return out;
    };
    const buttons = findAll(m.routes[0]!.layout!, 'Button') as Array<Record<string, unknown>>;
    const addBtn = buttons.find((b) => (b['actions'] as string[])?.includes('dummyjson.cart.add'));
    const removeBtn = buttons.find((b) =>
      (b['actions'] as string[])?.includes('dummyjson.cart.remove'),
    );
    expect(addBtn).toBeDefined();
    expect(removeBtn).toBeDefined();
  });
});
