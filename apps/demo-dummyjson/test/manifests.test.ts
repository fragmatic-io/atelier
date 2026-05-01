// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Manifest builder tests for the dummyjson catalog demo.
 *
 * Marketplace pivot: `<ProductCard>` and `<ProductGrid>` are gone. The
 * `/browse` body is now a baseline `<Grid data={products}>` declaring a
 * single `<Card>` template child — the data-aware Grid threads each
 * product onto the Card's `data` prop and the Card pulls its tile fields
 * from the product shape automatically. Per-item dispatch flows through
 * `actionSlots: ['onAction']` on both bindings.
 *
 * Cart, Product detail, and Checkout still ride custom bindings
 * (`<CartItemList>`, `<ProductDetail>`, `<CheckoutWizard>`) — those
 * collapses are follow-ups documented on the marketplace plan.
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
  it('mounts a baseline <Grid> over <Card> on /browse for every density', () => {
    for (const density of ['compact', 'comfortable', 'spacious'] as const) {
      const m = manifestForRoute('/browse', density);
      expect(m).not.toBeNull();
      const grid = findFirst(m!.routes[0]!.layout, 'Grid');
      expect(grid).not.toBeNull();
      // Bound to the catalog list capability.
      expect((grid!['data'] as { source: string }).source).toBe('dummyjson.product.list');
      // Single Card template child for the runtime to clone per item.
      const children = grid!['children'] as Array<Record<string, unknown>>;
      expect(children).toHaveLength(1);
      expect(children[0]!['component']).toBe('Card');
      // The Card declares its add-to-cart button declaratively.
      const cardProps = children[0]!['props'] as { actions: Array<{ id: string }> };
      expect(cardProps.actions).toEqual([
        { id: 'dummyjson.cart.add', label: 'Add', variant: 'primary' },
      ]);
      // Per-density columns.
      const expectedColumns = density === 'compact' ? 1 : density === 'spacious' ? 2 : 3;
      expect((grid!['props'] as { columns: number }).columns).toBe(expectedColumns);
    }
  });

  it('has no <ProductCard> / <ProductGrid> nodes anywhere (marketplace pivot)', () => {
    for (const density of ['compact', 'comfortable', 'spacious'] as const) {
      const m = browseManifest(density);
      expect(findFirst(m.routes[0]!.layout, 'ProductCard')).toBeNull();
      expect(findFirst(m.routes[0]!.layout, 'ProductGrid')).toBeNull();
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
      // Marketplace pivot: chrome is `<Stack(Logo, NavBar, StatusBar)>`
      // pure baseline composition. The `<StatusBar>` carries the
      // `dummyjson.cart.add.rate_limit` data binding the policy walker
      // looks for; ambient `RATE_LIMIT_CHIP_AMBIENT_SATISFIER` clears the
      // obligation if the chip is collapsed off-screen.
      const chip = findFirst(m.routes[0]!.layout!, 'StatusBar');
      expect(chip).not.toBeNull();
      const data = chip?.['data'] as { source?: string } | undefined;
      expect(data?.source).toMatch(/\.rate_limit$/);
      // The retired `<MarigoldHeader>` / `<Wordmark>` / `<RateLimitChip>`
      // customs are gone.
      expect(findFirst(m.routes[0]!.layout!, 'MarigoldHeader')).toBeNull();
      expect(findFirst(m.routes[0]!.layout!, 'Wordmark')).toBeNull();
      expect(findFirst(m.routes[0]!.layout!, 'RateLimitChip')).toBeNull();
      // Pure-baseline brand chrome — `<Logo>` + `<NavBar>` siblings.
      expect(findFirst(m.routes[0]!.layout!, 'Logo')).not.toBeNull();
      expect(findFirst(m.routes[0]!.layout!, 'NavBar')).not.toBeNull();
    }
  });

  it('drops the card-sized StatCard quota indicator from the body', () => {
    // The old design surfaced the rate-limit quota as a card-sized
    // StatCard in the page body. The new design moves that to a
    // `<StatusBar>` chip in the chrome header (asserted above).
    const m = browseManifest('comfortable')!;
    expect(findFirst(m.routes[0]!.layout!, 'StatCard')).toBeNull();
  });

  it('does not need off-screen reversibility anchor buttons (Phase 2 #5)', () => {
    // Pre-Phase-2-#5 the manifest carried a `<Stack>` of `<Button>`s for
    // `cart.add` / `cart.remove` positioned off-screen with
    // `data-cir-policy-anchor=reversibility`, solely to satisfy the
    // `reversibility_surfaced` policy walker. Reversibility is now
    // declared as an `AmbientPolicySatisfier` on the services bag (see
    // `lib/cir-providers.tsx`), so the manifest should be free of those
    // anchor buttons.
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
    expect(addBtn).toBeUndefined();
    expect(removeBtn).toBeUndefined();
  });
});
