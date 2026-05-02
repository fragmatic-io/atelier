// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Manifest builder tests for the dummyjson catalog demo.
 *
 * Marketplace pivot — closing chapter. The three remaining commerce
 * customs (`<ProductDetail>`, `<CartItemList>`, `<CheckoutWizard>`) have
 * been retired. Every Marigold route composes baseline primitives:
 *
 *   - `/browse`    → `<Grid data={products}>` over a single `<Card>` template
 *   - `/product/N` → `<Stack(Gallery, Card, DetailView)>` all bound to the
 *                    same `{ source: 'dummyjson.product.list', filter: 'id=N' }`
 *   - `/cart`      → `<Queue data={cart.list}>` with a remove action +
 *                    a `<Markdown>` totals line linking to /checkout
 *   - `/checkout`  → `<Stack>` of three `<Form>`s (Shipping / Payment / Review)
 */

import { describe, expect, it } from 'vitest';
import { ManifestSchema } from '@atelier/schemas';
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

function findAll(
  node: unknown,
  componentName: string,
  out: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (!node || typeof node !== 'object') return out;
  const obj = node as Record<string, unknown>;
  if (obj['component'] === componentName) out.push(obj);
  const children = obj['children'];
  if (Array.isArray(children)) {
    for (const c of children) findAll(c, componentName, out);
  }
  return out;
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

  it('marketplace pivot — no custom commerce nodes anywhere in any manifest', () => {
    const customs = [
      'ProductCard',
      'ProductGrid',
      'ProductDetail',
      'CartItemList',
      'CheckoutWizard',
    ];
    for (const density of ['compact', 'comfortable', 'spacious'] as const) {
      const manifests = [
        browseManifest(density),
        productManifest('1', density),
        cartManifest(density),
        checkoutManifest(density),
      ];
      for (const m of manifests) {
        for (const custom of customs) {
          expect(findFirst(m.routes[0]!.layout, custom)).toBeNull();
        }
      }
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

  it('/cart mounts a <Queue> bound to cart.list with a remove action', () => {
    const m = cartManifest('comfortable')!;
    const queue = findFirst(m.routes[0]!.layout!, 'Queue');
    expect(queue).not.toBeNull();
    const data = queue!['data'] as { source: string; filter: string };
    expect(data.source).toBe('dummyjson.cart.list');
    expect(data.filter).toContain('user_id = 1');
    const props = queue!['props'] as { actions: Array<{ id: string }> };
    expect(props.actions[0]!.id).toBe('dummyjson.cart.remove');
    // Capability dispatch is wired via the manifest's `actions` slot.
    expect(queue!['actions']).toEqual(['dummyjson.cart.remove']);
  });

  it('/cart surfaces a checkout link in the totals footer', () => {
    const m = cartManifest('comfortable')!;
    // The totals/checkout footer is a baseline <Markdown> line carrying
    // the inline link — no <Button> needed since the route is a static href.
    const markdowns = findAll(m.routes[0]!.layout!, 'Markdown');
    const checkoutLine = markdowns.find(
      (md) =>
        typeof (md['props'] as { content?: string }).content === 'string' &&
        (md['props'] as { content: string }).content.toLowerCase().includes('checkout'),
    );
    expect(checkoutLine).toBeDefined();
  });

  it('/product/[id] composes <Gallery> + <Card> + <DetailView> all bound to the same product', () => {
    const m = productManifest('15', 'comfortable')!;
    const gallery = findFirst(m.routes[0]!.layout!, 'Gallery');
    const card = findFirst(m.routes[0]!.layout!, 'Card');
    const detail = findFirst(m.routes[0]!.layout!, 'DetailView');
    expect(gallery).not.toBeNull();
    expect(card).not.toBeNull();
    expect(detail).not.toBeNull();
    for (const node of [gallery!, card!, detail!]) {
      const data = node['data'] as { source: string; filter: string };
      expect(data.source).toBe('dummyjson.product.list');
      expect(data.filter).toBe('id = 15');
    }
    // The Card declares the add-to-cart action declaratively.
    const cardProps = card!['props'] as { actions: Array<{ id: string }> };
    expect(cardProps.actions[0]!.id).toBe('dummyjson.cart.add');
  });

  it('/product/[id] still mounts the recommendations rail via a baseline <List>', () => {
    const m = productManifest('15', 'comfortable')!;
    const recList = findFirst(m.routes[0]!.layout!, 'List');
    expect(recList).not.toBeNull();
    const data = recList!['data'] as { source: string; filter: string };
    expect(data.source).toBe('dummyjson.product.recommendations');
    expect(data.filter).toContain('15');
  });

  it('/checkout composes a <Stack> of three <Form>s — one per step', () => {
    const m = checkoutManifest('comfortable')!;
    const forms = findAll(m.routes[0]!.layout!, 'Form');
    expect(forms.length).toBe(3);
    // Step submit labels indicate the progression.
    const labels = forms.map((f) => (f['props'] as { submitLabel?: string }).submitLabel);
    expect(labels).toEqual(['Continue to payment', 'Review order', 'Place order']);
    // Each form contains its own input children — the shipping form has
    // multiple TextInputs, the review form has a Markdown summary.
    const shipping = forms[0]!;
    const shippingInputs = (shipping['children'] as Array<Record<string, unknown>>).filter(
      (c) => c['component'] === 'TextInput',
    );
    expect(shippingInputs.length).toBeGreaterThanOrEqual(4);
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
    // `lib/atelier-providers.tsx`), so the manifest should be free of those
    // anchor buttons.
    const m = browseManifest('comfortable')!;
    const buttons = findAll(m.routes[0]!.layout!, 'Button') as Array<Record<string, unknown>>;
    const addBtn = buttons.find((b) => (b['actions'] as string[])?.includes('dummyjson.cart.add'));
    const removeBtn = buttons.find((b) =>
      (b['actions'] as string[])?.includes('dummyjson.cart.remove'),
    );
    expect(addBtn).toBeUndefined();
    expect(removeBtn).toBeUndefined();
  });
});
