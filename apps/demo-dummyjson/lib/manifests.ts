// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Hand-written manifests for the dummyjson catalog demo. The
 * `FallbackCompiler` calls `manifestForRoute` on a cache miss; without a
 * Gemini key set, this is the only source the compiler ever sees.
 *
 * The headline trick is **lens-driven layout**: the manifest emits a
 * different `<Grid columns>` per density (1 / 3 / 2) and threads that
 * density into the per-tile `<Card>`s, so compact serves a single-column
 * rich list, comfortable serves a 3-column tile grid, and spacious serves
 * a 2-column oversized grid.
 *
 * What changed in this rev (marketplace pivot — `<ProductCard>` and
 * `<ProductGrid>` collapsed onto baseline composition):
 *
 *   - `/browse`: the body is a baseline `<Grid data={products}>` declaring
 *     a single `<Card>` template child. The Grid threads each item as the
 *     Card's `data` prop; the Card pulls its tile fields (`image`, `title`,
 *     `subtitle`, `price`, `badge`) from the item shape automatically. The
 *     manifest's `actions: ['dummyjson.cart.add', ...]` list is wired
 *     through `actionSlots: ['onAction']` on `<Grid>` and forwarded onto
 *     each rendered Card so per-item dispatch works without per-cell
 *     wiring. No `<ProductGrid>` wrapper, no `<ProductCard>` row.
 *   - The off-screen `REVERSIBILITY_ANCHOR_NODE` is **gone**.
 *     Reversibility is surfaced ambiently by the `<UndoToast>` mounted at
 *     the app root by `<CirProviders>`, declared as an
 *     `AmbientPolicySatisfier` for `reversibility_surfaced`.
 *   - `/cart`: real `<CartItemList>` with line items, totals, and a
 *     designed empty state. (Still custom — follow-up.)
 *   - `/product/[id]`: real `<ProductDetail>` (gallery + info + qty + add
 *     to cart). (Still custom — follow-up.) Recommendations rail rides the
 *     `dummyjson.product.recommendations` capability via a baseline
 *     `<List>`.
 *   - `/checkout`: real `<CheckoutWizard>` with three steps and progressive
 *     disclosure. (Still custom — follow-up.)
 *
 * Policy obligations the manifests still satisfy:
 *
 *   - `rate_limited_actions_show_state`: a `<RateLimitChip>` lives in the
 *     header on every route that exposes `dummyjson.cart.add` (so the
 *     custom binding plays the role of the old `<StatCard>`).
 *   - `reversibility_surfaced`: a hidden `<Button>` carrying
 *     `dummyjson.cart.remove` is co-located with each route that exposes
 *     `dummyjson.cart.add` so the policy walks find the rollback action.
 *     The on-screen affordance is the in-grid undo toast.
 *   - `empty_loading_error_handled` (Phase 2 #4 — resolver fallback):
 *     loading and error fall through to the resolver default supplied by
 *     the React render walker; only distinctive empties (the cart's "Your
 *     cart is empty" voice, the product detail's "not found" branch, the
 *     recommendations' "browse more to seed picks" copy) stay inline.
 */

import type { LayoutNode, Manifest } from '@cir/schemas';
import type { Density } from '@cir/components';

const COMPILED_FROM = {
  capability_version: '0.1.0',
  skill_versions: {
    'product-grid-density': '0.2.0',
    'price-emphasis': '0.1.0',
    'cart-feedback': '0.2.0',
    'checkout-progressive': '0.2.0',
    'out-of-stock-handling': '0.1.0',
    'recommendation-tile': '0.1.0',
  },
  component_catalog_version: '1.0.0',
  intent_profile_version: 1,
  compiler_model: 'fallback-hand-written',
  compiled_at: '2026-04-30T00:00:00Z',
};

const INVALIDATES_ON = [
  'capability_schema_change:dummyjson.product.list:>=0.2.0',
  'capability_schema_change:dummyjson.product.search:>=0.2.0',
  'capability_schema_change:dummyjson.cart.add:>=0.2.0',
  'capability_schema_change:dummyjson.cart.list:>=0.2.0',
  'capability_schema_change:dummyjson.cart.remove:>=0.2.0',
  'intent_profile_change:demo-user:lens.density',
  'skill.version_changed:product-grid-density',
];

const POLICIES_SATISFIED = [
  'data_access_within_grant',
  'confirmation_required_for_destructive',
  'rate_limited_actions_show_state',
  'reversibility_surfaced',
  'empty_loading_error_handled',
];

/**
 * The header on every route. Composed entirely from baseline primitives
 * after the marketplace pivot:
 *
 *   `<Stack direction="horizontal">` →
 *      `<Logo glyph="🌼" wordmark="marigold" />`,
 *      `<NavBar items={...} />`,
 *      `<StatusBar variant="compact" status="operational" message="60/60" />`
 *
 * The retired customs (`MarigoldHeader`, `Wordmark`, `RateLimitChip`)
 * are gone — the manifest declares structure + capability binding;
 * `<StatusBar>`'s `data: { source: 'dummyjson.cart.add.rate_limit' }`
 * keeps the `rate_limited_actions_show_state` policy walker honest, and
 * `RATE_LIMIT_CHIP_AMBIENT_SATISFIER` declared on the policy context
 * covers any route where the chip is collapsed off-screen.
 */
function chromeHeader(activePath: string): LayoutNode {
  const navItems: { label: string; href: string; active: boolean }[] = [
    { label: 'Browse', href: '/browse', active: activePath === '/browse' },
    { label: 'Cart', href: '/cart', active: activePath === '/cart' },
  ];
  return {
    component: 'Stack',
    props: { direction: 'horizontal', gap: 'md', align: 'center' },
    children: [
      {
        component: 'Logo',
        props: {
          glyph: '\u{1F33C}', // marigold flower — the demo's brand glyph
          wordmark: 'marigold',
          size: 'md',
          href: '/browse',
        },
        children: [],
      },
      {
        component: 'NavBar',
        props: { items: navItems },
        children: [],
      },
      {
        component: 'StatusBar',
        props: { variant: 'compact', status: 'operational', message: '60/60' },
        // Bound to the cart-add quota source so the
        // `rate_limited_actions_show_state` policy walker sees a quota
        // ancestor on every route that exposes `dummyjson.cart.*`.
        data: { source: 'dummyjson.cart.add.rate_limit' },
        children: [],
      },
    ],
  };
}

// Pre-Phase-2-#5, this module exported a `REVERSIBILITY_ANCHOR_NODE` —
// an off-screen `<Stack>` of `<Button>`s carrying `cart.add` / `cart.remove`
// just to satisfy the `reversibility_surfaced` policy walker. That node
// was a band-aid: the data-bound nodes already raise an inline undo
// toast, AND the runtime mounts a global `<UndoToast>` at the app root.
// Phase 2 #5 lets the host declare those services as
// `AmbientPolicySatisfier`s in `cir-providers.tsx`, so the policy clears
// the obligation without an in-manifest anchor. The constant is gone;
// the manifests below are the actual rendered tree.

const PAGE_HEADER_NODE = (title: string, subtitle: string) => ({
  component: 'Stack',
  props: { direction: 'vertical' as const, gap: 'xs' as const },
  children: [
    {
      component: 'Markdown',
      props: { content: `# ${title}` },
      children: [],
    },
    {
      component: 'Markdown',
      props: { content: subtitle, variant: 'muted' as const },
      children: [],
    },
  ],
});

/**
 * Distinctive empty-state nodes. Phase 2 #4 — only routes whose empty state
 * carries product-meaningful copy still author one. Loading and error
 * defaults come from the resolver pipeline (a `<Skeleton shape="table-row">`
 * and an `<Alert severity="error" title="Failed to load">`); the previous
 * inline `SKELETON_CARD_NODE` / `SKELETON_LIST_NODE` / `ERROR_NODE` were
 * indistinguishable from those defaults and have been removed.
 */

// Densities -> manifest-id suffix that satisfies `^m_[a-z0-9]{8,}$`.
const DENSITY_TAG: Readonly<Record<Density, string>> = Object.freeze({
  compact: 'c',
  comfortable: 'y',
  spacious: 's',
});

export function browseManifest(density: Density): Manifest {
  const columns = density === 'compact' ? 1 : density === 'spacious' ? 2 : 3;
  // Marketplace pivot: the body is a baseline `<Grid>` with a `<Card>`
  // template child. The Grid threads each product as the Card's `data`
  // prop; the Card derives image/title/subtitle/price/badge from the
  // product shape. The runtime wires `onAction` through `actionSlots:
  // ['onAction']` on Grid, forwards it to each Card, and the Card's
  // declarative footer button dispatches `dummyjson.cart.add`.
  //
  // Trade-off: the previous `<ProductGrid>` rendered an inline filter bar
  // (search + category chips + in-stock toggle). Composing that off
  // baseline is a separate decision (the manifest could add a sibling
  // `<FilterBar>` tomorrow); this commit drops the pretty-printed
  // categories prop in exchange for losing the bespoke binding.
  const gridNode: LayoutNode = {
    component: 'Grid',
    data: {
      source: 'dummyjson.product.list',
      sort: 'rating desc',
      // Distinctive empty: "Nothing here yet" with a filter-tweak prompt.
      empty_state: {
        component: 'EmptyState',
        props: {
          title: 'Nothing here yet',
          description: 'Adjust the filters or clear the search to see more results.',
        },
        children: [],
      },
    },
    actions: ['dummyjson.cart.add', 'dummyjson.cart.remove'],
    props: { columns, density },
    children: [
      {
        component: 'Card',
        props: {
          variant: 'bordered' as const,
          actions: [{ id: 'dummyjson.cart.add', label: 'Add', variant: 'primary' as const }],
        },
        children: [],
      },
    ],
  };

  return {
    manifest_id: `m_browse${DENSITY_TAG[density]}001`,
    user_id: 'demo-user',
    app_id: 'cir.demo-dummyjson',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: INVALIDATES_ON,
    policies_satisfied: POLICIES_SATISFIED,
    routes: [
      {
        path: '/browse',
        title: 'Browse',
        layout: {
          component: 'Container',
          props: { maxWidth: 'lg' as const, density },
          children: [
            {
              component: 'Stack',
              props: { direction: 'vertical' as const, gap: 'lg' as const, density },
              children: [
                chromeHeader('/browse'),
                PAGE_HEADER_NODE(
                  'Browse',
                  '30 products across smartphones, laptops, fragrances, skincare, groceries. Switch density at /settings/lens.',
                ),
                gridNode,
              ],
            },
          ],
        },
        refresh: {
          data: 'on_focus + 600s_interval',
          structure: 'on_intent_change:density',
        },
      },
    ],
  };
}

export function productManifest(id: string, density: Density): Manifest {
  // Sanitise `id` for the manifest id format (`^m_[a-z0-9]{8,}$`).
  const safeId = id
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '')
    .padStart(4, '0');
  return {
    manifest_id: `m_prd${DENSITY_TAG[density]}${safeId}`.padEnd(11, '0'),
    user_id: 'demo-user',
    app_id: 'cir.demo-dummyjson',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: INVALIDATES_ON,
    policies_satisfied: POLICIES_SATISFIED,
    routes: [
      {
        path: `/product/${id}`,
        title: 'Product',
        layout: {
          component: 'Container',
          props: { maxWidth: 'lg' as const, density },
          children: [
            {
              component: 'Stack',
              props: { direction: 'vertical' as const, gap: 'lg' as const, density },
              children: [
                chromeHeader('/product/' + id),
                {
                  component: 'ProductDetail',
                  data: {
                    source: 'dummyjson.product.list',
                    filter: `id = ${id}`,
                    // Distinctive: a "not found in catalog" branch.
                    empty_state: {
                      component: 'EmptyState',
                      props: {
                        title: 'Product not found',
                        description: 'That id isn’t in the catalog. Try /browse.',
                      },
                      children: [],
                    },
                  },
                  actions: ['dummyjson.cart.add', 'dummyjson.cart.remove'],
                  props: { density },
                  children: [],
                },
                {
                  component: 'Markdown',
                  props: { content: '## You might also like', variant: 'heading' as const },
                  children: [],
                },
                {
                  component: 'List',
                  data: {
                    source: 'dummyjson.product.recommendations',
                    filter: `product_id = ${id}`,
                    // Distinctive: nudge the user to browse more.
                    empty_state: {
                      component: 'EmptyState',
                      props: {
                        title: 'No recommendations yet',
                        description: 'Browse a few more products to seed personalised picks.',
                      },
                      children: [],
                    },
                  },
                  actions: ['dummyjson.cart.add', 'dummyjson.cart.remove'],
                  props: { variant: 'tinted', density },
                  children: [],
                },
              ],
            },
          ],
        },
        refresh: {
          data: 'on_focus',
          structure: 'never_unless_invalidated',
        },
      },
    ],
  };
}

export function cartManifest(density: Density): Manifest {
  return {
    manifest_id: `m_cart${DENSITY_TAG[density]}0001`,
    user_id: 'demo-user',
    app_id: 'cir.demo-dummyjson',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: INVALIDATES_ON,
    policies_satisfied: POLICIES_SATISFIED,
    routes: [
      {
        path: '/cart',
        title: 'Cart',
        layout: {
          component: 'Container',
          props: { maxWidth: 'md' as const, density },
          children: [
            {
              component: 'Stack',
              props: { direction: 'vertical' as const, gap: 'lg' as const, density },
              children: [
                chromeHeader('/cart'),
                PAGE_HEADER_NODE(
                  'Your cart',
                  'Review the line items below. Removing is reversible — the toast at the bottom shows an undo for 5 seconds.',
                ),
                {
                  component: 'CartItemList',
                  data: {
                    source: 'dummyjson.cart.list',
                    filter: 'user_id = 1',
                    // Distinctive: the cart's "Your cart is empty" voice.
                    empty_state: {
                      component: 'EmptyState',
                      props: {
                        title: 'Your cart is empty',
                        description:
                          'Browse the catalog and tap “Add to cart” — items show up here with a 5s undo toast.',
                      },
                      children: [],
                    },
                  },
                  actions: ['dummyjson.cart.remove', 'dummyjson.cart.add'],
                  props: { density },
                  children: [],
                },
              ],
            },
          ],
        },
        refresh: {
          data: 'on_focus + 30s_interval',
          structure: 'never_unless_invalidated',
        },
      },
    ],
  };
}

export function checkoutManifest(density: Density): Manifest {
  return {
    manifest_id: `m_chkout${DENSITY_TAG[density]}001`,
    user_id: 'demo-user',
    app_id: 'cir.demo-dummyjson',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: INVALIDATES_ON,
    policies_satisfied: [...POLICIES_SATISFIED, 'progressive_disclosure_for_long_forms'],
    routes: [
      {
        path: '/checkout',
        title: 'Checkout',
        layout: {
          component: 'Container',
          props: { maxWidth: 'md' as const, density },
          children: [
            {
              component: 'Stack',
              props: { direction: 'vertical' as const, gap: 'lg' as const, density },
              children: [
                chromeHeader('/checkout'),
                PAGE_HEADER_NODE(
                  'Checkout',
                  'Three quick steps. Each one is reversible until you place the order.',
                ),
                {
                  component: 'CheckoutWizard',
                  props: {},
                  children: [],
                },
              ],
            },
          ],
        },
        refresh: {
          data: 'on_focus',
          structure: 'never_unless_invalidated',
        },
      },
    ],
  };
}

const PRODUCT_ROUTE_RE = /^\/product\/([\w-]+)$/u;

export function manifestForRoute(route: string, density: Density): Manifest | null {
  if (route === '/browse' || route === '/') return browseManifest(density);
  if (route === '/cart') return cartManifest(density);
  if (route === '/checkout') return checkoutManifest(density);
  const m = PRODUCT_ROUTE_RE.exec(route);
  if (m && m[1]) return productManifest(m[1], density);
  return null;
}
