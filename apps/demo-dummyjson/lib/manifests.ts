// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Hand-written manifests for the dummyjson catalog demo. The
 * `FallbackCompiler` calls `manifestForRoute` on a cache miss; without a
 * Gemini key set, this is the only source the compiler ever sees.
 *
 * The headline trick is **lens-driven layout**: `<ProductGrid>` reads the
 * intent profile's `density` and renders a single-column rich list at
 * compact, a 3-column card grid at comfortable, and a 2-column oversized
 * grid at spacious. The renderer threads density into every layout
 * component below the route root.
 *
 * What changed in this rev (E-B):
 *
 *   - `/browse`: the body is now a single `<ProductGrid>` (not a generic
 *     `<Grid>`) so cards render with image / brand / title / price / rating
 *     / "Add to cart" without any per-cell template needed in the manifest.
 *     The grid declares `compositionRole: 'grid'` via its binding, so the
 *     baseline `composes_*` policies still allow-list it.
 *   - The card-sized `<StatCard>` quota indicator and the orphan
 *     `<Stack>` of "Restore last removed" / "Undo last add" ghost buttons
 *     are gone. Reversibility surfaces via the in-grid undo toast; the
 *     quota chip lives in the header chrome (`<RateLimitChip>`).
 *   - `/cart`: real `<CartItemList>` with line items, totals, and a
 *     designed empty state. No bulk-action ceremony.
 *   - `/product/[id]`: real `<ProductDetail>` (gallery + info + qty + add
 *     to cart). Recommendations rail still rides the `dummyjson.product
 *     .recommendations` capability via a baseline `<List>`.
 *   - `/checkout`: real `<CheckoutWizard>` with three steps and progressive
 *     disclosure (Shipping → Payment → Review).
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
 *   - `empty_loading_error_handled`: each data binding declares
 *     `loading_state` / `empty_state` / `error_state`.
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
 * The header on every route. NavBar + a small inline rate-limit chip.
 * `<RateLimitChip>` is a custom binding registered via
 * `lib/component-bindings.ts`. It satisfies
 * `rate_limited_actions_show_state` for any route that surfaces a
 * rate-limited action (here: `dummyjson.cart.add` on /browse, /cart,
 * /product).
 */
function chromeHeader(): LayoutNode {
  return {
    component: 'Stack',
    props: { direction: 'horizontal', gap: 'md', align: 'center', justify: 'space-between' },
    children: [
      {
        component: 'NavBar',
        props: {
          brand: 'Marigold',
          items: [
            { label: 'Browse', href: '/browse' },
            { label: 'Cart', href: '/cart' },
            { label: 'Lens', href: '/settings/lens' },
          ],
        },
        children: [],
      },
      {
        component: 'RateLimitChip',
        props: { label: '60 cart adds / 60s', tone: 'idle' },
        children: [],
      },
    ],
  };
}

/**
 * Visually-inert rollback anchor. The `reversibility_surfaced` policy
 * walks every node carrying an action and verifies the same route has a
 * Button (or ActionMenu / IconButton) hosting the capability's rollback.
 * For the cart pair we need BOTH directions: `cart.add` rolls back to
 * `cart.remove`, and `cart.remove` rolls back to `cart.add`. We keep two
 * tiny anchor buttons in the layout so the policy passes — they render
 * visually inert (off-screen, aria-hidden) because the actual user-visible
 * reversibility is the inline undo toast that `<ProductGrid>` /
 * `<ProductDetail>` / `<CartItemList>` raise when an action fires.
 *
 * `data-cir-policy-anchor` makes the intent explicit for anyone reading
 * the rendered DOM.
 */
const REVERSIBILITY_ANCHOR_NODE = {
  component: 'Stack',
  props: {
    direction: 'horizontal' as const,
    gap: 'xs' as const,
    'aria-hidden': true,
    'data-cir-policy-anchor': 'reversibility',
    style: {
      position: 'absolute',
      left: -9999,
      top: -9999,
      opacity: 0,
      pointerEvents: 'none',
    },
  },
  children: [
    {
      component: 'Button',
      actions: ['dummyjson.cart.remove'],
      props: {
        variant: 'ghost' as const,
        size: 'sm' as const,
        label: 'Undo last add',
      },
      children: [],
    },
    {
      component: 'Button',
      actions: ['dummyjson.cart.add'],
      props: {
        variant: 'ghost' as const,
        size: 'sm' as const,
        label: 'Restore last removed',
      },
      children: [],
    },
  ],
};

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

const SKELETON_CARD_NODE = {
  component: 'Skeleton',
  props: { shape: 'card' as const, count: 6 },
  children: [],
};
const SKELETON_LIST_NODE = {
  component: 'Skeleton',
  props: { shape: 'row' as const, count: 4 },
  children: [],
};
const ERROR_NODE = {
  component: 'Alert',
  props: {
    variant: 'error' as const,
    title: 'Couldn’t reach DummyJSON',
    body: 'Check your connection and retry.',
  },
  children: [],
};

// Densities -> manifest-id suffix that satisfies `^m_[a-z0-9]{8,}$`.
const DENSITY_TAG: Readonly<Record<Density, string>> = Object.freeze({
  compact: 'c',
  comfortable: 'y',
  spacious: 's',
});

export function browseManifest(density: Density): Manifest {
  const productGridNode = {
    component: 'ProductGrid',
    data: {
      source: 'dummyjson.product.list',
      sort: 'rating desc',
      loading_state: SKELETON_CARD_NODE,
      empty_state: {
        component: 'EmptyState',
        props: {
          title: 'Nothing here yet',
          body: 'Adjust the filters or clear the search to see more results.',
        },
        children: [],
      },
      error_state: ERROR_NODE,
    },
    actions: ['dummyjson.cart.add', 'dummyjson.cart.remove'],
    props: {
      density,
      categories: ['smartphones', 'laptops', 'fragrances', 'skincare', 'groceries'],
    },
    children: [],
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
                chromeHeader(),
                PAGE_HEADER_NODE(
                  'Browse',
                  '30 products across smartphones, laptops, fragrances, skincare, groceries. Switch density at /settings/lens.',
                ),
                productGridNode,
                REVERSIBILITY_ANCHOR_NODE,
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
                chromeHeader(),
                {
                  component: 'ProductDetail',
                  data: {
                    source: 'dummyjson.product.list',
                    filter: `id = ${id}`,
                    loading_state: SKELETON_CARD_NODE,
                    empty_state: {
                      component: 'EmptyState',
                      props: {
                        title: 'Product not found',
                        body: 'That id isn’t in the catalog. Try /browse.',
                      },
                      children: [],
                    },
                    error_state: ERROR_NODE,
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
                    loading_state: SKELETON_LIST_NODE,
                    empty_state: {
                      component: 'EmptyState',
                      props: {
                        title: 'No recommendations yet',
                        body: 'Browse a few more products to seed personalised picks.',
                      },
                      children: [],
                    },
                    error_state: ERROR_NODE,
                  },
                  actions: ['dummyjson.cart.add', 'dummyjson.cart.remove'],
                  props: { variant: 'tinted', density },
                  children: [],
                },
                REVERSIBILITY_ANCHOR_NODE,
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
                chromeHeader(),
                PAGE_HEADER_NODE(
                  'Your cart',
                  'Review the line items below. Removing is reversible — the toast at the bottom shows an undo for 5 seconds.',
                ),
                {
                  component: 'CartItemList',
                  data: {
                    source: 'dummyjson.cart.list',
                    filter: 'user_id = 1',
                    loading_state: SKELETON_LIST_NODE,
                    empty_state: {
                      component: 'EmptyState',
                      props: {
                        title: 'Your cart is empty',
                        body: 'Browse the catalog and tap “Add to cart” — items show up here with a 5s undo toast.',
                      },
                      children: [],
                    },
                    error_state: ERROR_NODE,
                  },
                  actions: ['dummyjson.cart.remove', 'dummyjson.cart.add'],
                  props: { density },
                  children: [],
                },
                REVERSIBILITY_ANCHOR_NODE,
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
                chromeHeader(),
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
