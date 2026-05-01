// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Demo-app-specific `ComponentBinding`s for the dummyjson catalog. Five
 * custom components ship in `apps/demo-dummyjson/components/` and need to
 * be referenceable from manifests by name (so `<RenderNode>` finds a
 * factory when it walks the layout tree):
 *
 *   - `ProductCard`  — single-product card (used by `ProductGrid`).
 *   - `ProductGrid`  — manifest-bound product catalog. Declares
 *     `compositionRole: 'grid'` so the policy engine treats it like the
 *     baseline `<Grid>` for `composes_hierarchy_for_long_lists` and
 *     `composes_according_to_rules`.
 *   - `ProductDetail` — single-product surface for `/product/[id]`.
 *   - `CartItemList`  — `/cart` rows + totals + checkout CTA. Declares
 *     `compositionRole: 'list'`.
 *   - `CheckoutWizard` — the `/checkout` step flow.
 *   - `RateLimitChip`  — small inline header chip surfacing the cart-add
 *     quota (replaces the old card-sized `<StatCard>` in `/browse`).
 *   - `Wordmark`       — the Marigold brand lockup.
 *
 * The runtime registers these alongside `COMPONENT_BINDINGS` (the baseline
 * catalog). Any binding declaring a `compositionRole` is also collected
 * into a `composition_roles` map and threaded onto `validateManifest`'s
 * `PolicyContext` so the policy engine recognises custom List/Grid/Table
 * components without forking the baseline rule set.
 */

import type { ComponentBinding } from '@cir/runtime';
import { CartItemList } from '@/components/CartItemList';
import { CheckoutWizard } from '@/components/CheckoutWizard';
import { MarigoldHeader } from '@/components/MarigoldHeader';
import { ProductCard } from '@/components/ProductCard';
import { ProductDetail } from '@/components/ProductDetail';
import { ProductGrid } from '@/components/ProductGrid';
import { RateLimitChip } from '@/components/RateLimitChip';
import { Wordmark } from '@/components/Wordmark';

export const ProductCardBinding: ComponentBinding = {
  id: 'ProductCard',
  factory: ProductCard as ComponentBinding['factory'],
};

export const ProductGridBinding: ComponentBinding = {
  id: 'ProductGrid',
  factory: ProductGrid as ComponentBinding['factory'],
  // Tells the policy engine this binding plays the role of `<Grid>` for the
  // `composes_hierarchy_for_long_lists` and `composes_according_to_rules`
  // checks. See `packages/runtime/src/registry/component-registry.ts`.
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

export const RateLimitChipBinding: ComponentBinding = {
  id: 'RateLimitChip',
  factory: RateLimitChip as ComponentBinding['factory'],
};

export const WordmarkBinding: ComponentBinding = {
  id: 'Wordmark',
  factory: Wordmark as ComponentBinding['factory'],
};

export const MarigoldHeaderBinding: ComponentBinding = {
  id: 'MarigoldHeader',
  factory: MarigoldHeader as ComponentBinding['factory'],
};

/**
 * All custom bindings the demo registers on top of `COMPONENT_BINDINGS`.
 * Spread into `MapComponentRegistry` after the baseline so manifests can
 * reference any of these names in `LayoutNode.component`.
 */
export const DEMO_DUMMYJSON_BINDINGS: Readonly<Record<string, ComponentBinding>> = Object.freeze({
  MarigoldHeader: MarigoldHeaderBinding,
  ProductCard: ProductCardBinding,
  ProductGrid: ProductGridBinding,
  ProductDetail: ProductDetailBinding,
  CartItemList: CartItemListBinding,
  CheckoutWizard: CheckoutWizardBinding,
  RateLimitChip: RateLimitChipBinding,
  Wordmark: WordmarkBinding,
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
