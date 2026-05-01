// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Marigold demo — host-side `ComponentBinding`s.
 *
 * Marketplace pivot continuation: `<ProductCard>` and `<ProductGrid>` are
 * gone. The `/browse` route now composes baseline `<Grid data={products}>`
 * + a single `<Card>` template child; the data-aware Grid threads each
 * product onto the Card's `data` prop and the Card pulls its tile fields
 * (image / title / subtitle / price / badge) from the product shape. The
 * runtime wires per-item `onAction` dispatch through `actionSlots:
 * ['onAction']` on both bindings — no host-side wrapper needed.
 *
 * What stays (three custom bindings — all genuine domain shapes still
 * pending a baseline collapse):
 *
 *   - `ProductDetail` — single-product surface for `/product/[id]`. Gallery
 *     + info + qty + add-to-cart. Will collapse onto baseline `<DetailView>`
 *     + `<Gallery>` + `<Card>` once those primitives gain the right
 *     commerce-tuned variants. Marketplace plan §D follow-up.
 *   - `CartItemList` — `/cart` rows + totals + checkout CTA. Declares
 *     `compositionRole: 'list'`. Will collapse onto baseline `<List>` +
 *     `<Card>` totals once the totals card becomes composable.
 *   - `CheckoutWizard` — the `/checkout` step flow. Will collapse onto
 *     baseline `<Wizard>` + per-step `<Form>` once Wizard accepts step
 *     data via `data` instead of children.
 *
 * The runtime registers these alongside `COMPONENT_BINDINGS` (the
 * baseline catalog). Any binding declaring a `compositionRole` is also
 * collected into a `composition_roles` map and threaded onto
 * `validateManifest`'s `PolicyContext`.
 */

import type { ComponentBinding } from '@cir/runtime';
import { CartItemList } from '@/components/CartItemList';
import { CheckoutWizard } from '@/components/CheckoutWizard';
import { ProductDetail } from '@/components/ProductDetail';

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
