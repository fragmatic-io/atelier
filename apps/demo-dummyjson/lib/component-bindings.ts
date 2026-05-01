// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Marigold demo — host-side `ComponentBinding`s.
 *
 * Marketplace pivot (this commit): three custom bindings retired by
 * collapsing onto baseline composition.
 *
 *   - `MarigoldHeader` → `<Stack(Logo, NavBar, StatusBar)>` pure baseline.
 *   - `Wordmark` → `<Logo>` baseline (glyph + wordmark lockup).
 *   - `RateLimitChip` → `<StatusBar>` bound to
 *     `dummyjson.cart.add.rate_limit`.
 *
 * What stays (five custom bindings, all genuine domain shapes):
 *
 *   - `ProductCard` — single-product card (used inside `ProductGrid`).
 *   - `ProductGrid` — manifest-bound product catalog with
 *     `compositionRole: 'grid'` so the policy engine treats it like
 *     baseline `<Grid>`. Collapsing `ProductGrid` onto `<Grid>` + `<Card>`
 *     composition is on the marketplace plan as a follow-up.
 *   - `ProductDetail` — single-product surface for `/product/[id]`.
 *   - `CartItemList` — `/cart` rows + totals + checkout CTA. Declares
 *     `compositionRole: 'list'`.
 *   - `CheckoutWizard` — the `/checkout` step flow.
 *
 * The runtime registers these alongside `COMPONENT_BINDINGS` (the
 * baseline catalog). Any binding declaring a `compositionRole` is also
 * collected into a `composition_roles` map and threaded onto
 * `validateManifest`'s `PolicyContext`.
 */

import type { ComponentBinding } from '@cir/runtime';
import { CartItemList } from '@/components/CartItemList';
import { CheckoutWizard } from '@/components/CheckoutWizard';
import { ProductCard } from '@/components/ProductCard';
import { ProductDetail } from '@/components/ProductDetail';
import { ProductGrid } from '@/components/ProductGrid';

export const ProductCardBinding: ComponentBinding = {
  id: 'ProductCard',
  factory: ProductCard as ComponentBinding['factory'],
};

export const ProductGridBinding: ComponentBinding = {
  id: 'ProductGrid',
  factory: ProductGrid as ComponentBinding['factory'],
  compositionRole: 'grid',
};

export const ProductDetailBinding: ComponentBinding = {
  id: 'ProductDetail',
  factory: ProductDetail as ComponentBinding['factory'],
};

export const CartItemListBinding: ComponentBinding = {
  id: 'CartItemList',
  factory: CartItemList as ComponentBinding['factory'],
  compositionRole: 'list',
};

export const CheckoutWizardBinding: ComponentBinding = {
  id: 'CheckoutWizard',
  factory: CheckoutWizard as ComponentBinding['factory'],
};

/**
 * Custom bindings the demo registers on top of `COMPONENT_BINDINGS`.
 * Spread into `MapComponentRegistry` after the baseline so manifests can
 * reference any of these names in `LayoutNode.component`.
 *
 * The `marketplace-pressure` eval gate caps this set's size so future
 * regressions ("just add another custom") are surfaced.
 */
export const DEMO_DUMMYJSON_BINDINGS: Readonly<Record<string, ComponentBinding>> = Object.freeze({
  ProductCard: ProductCardBinding,
  ProductGrid: ProductGridBinding,
  ProductDetail: ProductDetailBinding,
  CartItemList: CartItemListBinding,
  CheckoutWizard: CheckoutWizardBinding,
});

/**
 * Composition-role map derived from `DEMO_DUMMYJSON_BINDINGS`. Threaded
 * onto the `PolicyContext` in `cir-providers.tsx` so the policy engine
 * treats custom bindings declaring a role as if they were the baseline
 * List/Grid/Table component for composition allow-listing.
 */
export const DEMO_DUMMYJSON_COMPOSITION_ROLES: Readonly<Record<string, 'list' | 'grid' | 'table'>> =
  Object.freeze(
    Object.fromEntries(
      Object.values(DEMO_DUMMYJSON_BINDINGS)
        .filter(
          (b): b is ComponentBinding & { compositionRole: 'list' | 'grid' | 'table' } =>
            b.compositionRole === 'list' ||
            b.compositionRole === 'grid' ||
            b.compositionRole === 'table',
        )
        .map((b) => [b.id, b.compositionRole]),
    ),
  );
