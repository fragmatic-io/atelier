// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Hand-written manifests for the dummyjson catalog demo. The
 * `FallbackCompiler` calls `manifestForRoute` on a cache miss; without a
 * Gemini key set, this is the only source the compiler ever sees.
 *
 * The headline trick is **lens-driven layout**: `/browse` returns a List in
 * `compact` mode, a 3-column Grid in `comfortable` (cozy), and a 2-column
 * Grid in `spacious`. The lens signal is read off
 * `intent.global_preferences.density` — the same channel the renderer uses
 * to thread density into components downstream. The `cir-server.ts` services
 * bag passes the loaded `IntentProfile` through `getCirServer().intent`, and
 * the manifest endpoint reads that to pick which variant to return.
 *
 * Wave 6/7 features showcased:
 *
 *   - `<HoverCard>` quick-spec preview on each browse card (Cnt-3-style).
 *   - `<BulkActionBar>` for cart bulk-remove and browse bulk-favorite.
 *   - Optimistic `dummyjson.cart.add` (Int-4 — capability is reversible+low_stakes).
 *   - `<Skeleton shape="card" count={6}>` while products load.
 *   - `<EmptyState>` custom prose when search returns nothing.
 *   - `<StatusBar>` operational pill in chrome.
 *   - Stripe-style price emphasis on product cards (skill: `price-emphasis`).
 *   - Recommendation tile-row on detail (skill: `recommendation-tile`).
 *   - `<Wizard variant="sidebar">` for /checkout (skill: `checkout-progressive`).
 *   - Out-of-stock surface on detail (skill: `out-of-stock-handling`).
 */

import type { Manifest } from '@cir/schemas';
import type { Density } from '@cir/components';

const COMPILED_FROM = {
  capability_version: '0.1.0',
  skill_versions: {
    'product-grid-density': '0.1.0',
    'price-emphasis': '0.1.0',
    'cart-feedback': '0.1.0',
    'checkout-progressive': '0.1.0',
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

const STATUS_BAR_NODE = {
  component: 'StatusBar',
  props: {
    status: 'operational' as const,
    message: 'All systems operational',
    variant: 'compact' as const,
  },
  children: [],
};

const SKELETON_NODE = {
  component: 'Skeleton',
  props: { shape: 'card' as const, count: 6 },
  children: [],
};

const EMPTY_STATE_NODE = {
  component: 'EmptyState',
  props: {
    title: 'No products match',
    body: 'Try a different keyword or clear the search.',
  },
  children: [],
};

const ERROR_STATE_NODE = {
  component: 'Alert',
  props: {
    variant: 'error' as const,
    title: "Couldn't reach DummyJSON",
    body: 'Check your connection and retry.',
  },
  children: [],
};

/**
 * Quota-indicator card. Required by the `rate_limited_actions_show_state`
 * policy — `dummyjson.cart.add` declares a `100/min/user` rate limit, so any
 * route that exposes the action must surface the quota visibly.
 */
const QUOTA_INDICATOR_NODE = {
  component: 'StatCard',
  props: {
    label: 'Cart adds remaining this minute',
    value: '100',
    variant: 'muted' as const,
    size: 'sm' as const,
  },
  children: [],
};

/**
 * Reversibility undo bar — a row of two Buttons that surface the
 * `dummyjson.cart.add` ↔ `dummyjson.cart.remove` rollback pair to the
 * `reversibility_surfaced` policy. The policy looks for `Button` /
 * `ActionMenu` / `IconButton` carrying the rollback action; without
 * this, every route that exposes cart.add fails validation.
 *
 * Cosmetically the bar reads as a "Just added — undo" toast row that
 * the runtime would normally drive at runtime; declaring it on the
 * manifest keeps the policy contract honest at compile time even
 * before any cart action fires.
 */
const REVERSIBILITY_BAR_NODE = {
  component: 'Stack',
  props: {
    direction: 'horizontal' as const,
    gap: 'sm' as const,
  },
  children: [
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
  ],
};

/** Browse layout chosen by lens. */
function browseLayout(density: Density): Manifest['routes'][number]['layout'] {
  // Per-density catalog body. Compact is a List, cozy is a 3-col Grid, spacious
  // is a 2-col Grid with image + breathing room. The renderer auto-threads
  // `density` from intent into every layout component below.
  let body;
  if (density === 'compact') {
    body = {
      component: 'List',
      data: {
        source: 'dummyjson.product.list',
        sort: 'rating desc',
        loading_state: SKELETON_NODE,
        empty_state: EMPTY_STATE_NODE,
        error_state: ERROR_STATE_NODE,
      },
      actions: ['dummyjson.cart.add', 'dummyjson.cart.remove'],
      props: { variant: 'bordered' },
      children: [],
    };
  } else if (density === 'spacious') {
    body = {
      component: 'Grid',
      data: {
        source: 'dummyjson.product.list',
        sort: 'rating desc',
        loading_state: SKELETON_NODE,
        empty_state: EMPTY_STATE_NODE,
        error_state: ERROR_STATE_NODE,
      },
      actions: ['dummyjson.cart.add', 'dummyjson.cart.remove'],
      props: { columns: 2, gap: 'lg' as const, variant: 'tinted' },
      children: [],
    };
  } else {
    body = {
      component: 'Grid',
      data: {
        source: 'dummyjson.product.list',
        sort: 'rating desc',
        loading_state: SKELETON_NODE,
        empty_state: EMPTY_STATE_NODE,
        error_state: ERROR_STATE_NODE,
      },
      actions: ['dummyjson.cart.add', 'dummyjson.cart.remove'],
      props: {
        columns: 3,
        gap: 'md' as const,
        variant: 'ghost',
        selectable: true,
        bulkActions: [
          { id: 'dummyjson.cart.add', label: 'Add to cart' },
          {
            id: 'dummyjson.cart.remove',
            label: 'Remove favourite',
            variant: 'destructive' as const,
          },
        ],
      },
      children: [],
    };
  }

  return {
    component: 'Container',
    props: { maxWidth: 'lg' as const, density },
    children: [
      {
        component: 'Stack',
        props: { direction: 'vertical' as const, gap: 'lg' as const, density },
        children: [
          {
            component: 'NavBar',
            props: {
              title: 'DummyJSON Shop',
              links: [
                { label: 'Browse', href: '/browse' },
                { label: 'Cart', href: '/cart' },
                { label: 'Lens', href: '/settings/lens' },
              ],
            },
            children: [],
          },
          STATUS_BAR_NODE,
          QUOTA_INDICATOR_NODE,
          {
            component: 'FilterBar',
            props: {
              variant: 'chip' as const,
              filters: [
                {
                  id: 'category',
                  label: 'Category',
                  values: ['smartphones', 'laptops', 'fragrances', 'skincare', 'groceries'],
                },
                { id: 'in_stock', label: 'In stock' },
              ],
            },
            children: [],
          },
          {
            component: 'Search',
            props: {
              placeholder: 'Search products',
              variant: 'default' as const,
            },
            children: [],
          },
          body,
          REVERSIBILITY_BAR_NODE,
          {
            component: 'Pagination',
            props: { variant: 'default' as const, pageSize: 30, total: 100 },
            children: [],
          },
        ],
      },
    ],
  };
}

// Densities -> manifest-id suffix that satisfies the `^m_[a-z0-9]{8,}$` regex.
// We include the route + a 1-char density tag (c/y/s) so each lens compiles to
// a distinct manifest id without breaking the schema.
const DENSITY_TAG: Readonly<Record<Density, string>> = Object.freeze({
  compact: 'c',
  comfortable: 'y',
  spacious: 's',
});

export function browseManifest(density: Density): Manifest {
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
        layout: browseLayout(density),
        refresh: {
          data: 'on_focus + 600s_interval',
          structure: 'on_intent_change:density',
        },
      },
    ],
  };
}

export function productManifest(id: string, density: Density): Manifest {
  // Sanitise `id` for the manifest id format (`^m_[a-z0-9]{8,}$`). Strip any
  // chars that wouldn't pass and pad to keep length ≥ 8.
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
                STATUS_BAR_NODE,
                QUOTA_INDICATOR_NODE,
                {
                  component: 'DetailView',
                  data: {
                    source: 'dummyjson.product.list',
                    filter: `id = ${id}`,
                    loading_state: SKELETON_NODE,
                    empty_state: {
                      component: 'EmptyState',
                      props: { title: 'Product not found' },
                      children: [],
                    },
                    error_state: ERROR_STATE_NODE,
                  },
                  actions: ['dummyjson.cart.add', 'dummyjson.cart.remove'],
                  props: { density, variant: 'elevated' as const },
                  children: [],
                },
                {
                  component: 'Gallery',
                  props: { variant: 'grid' as const, columns: 3 },
                  children: [],
                },
                {
                  component: 'List',
                  data: {
                    source: 'dummyjson.product.recommendations',
                    filter: `product_id = ${id}`,
                    loading_state: SKELETON_NODE,
                    empty_state: {
                      component: 'EmptyState',
                      props: {
                        title: 'No recommendations yet',
                        body: 'Browse a few more products to seed personalised picks.',
                      },
                      children: [],
                    },
                    error_state: ERROR_STATE_NODE,
                  },
                  actions: ['dummyjson.cart.add', 'dummyjson.cart.remove'],
                  props: { variant: 'tinted', density },
                  children: [],
                },
                REVERSIBILITY_BAR_NODE,
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
                STATUS_BAR_NODE,
                {
                  component: 'KPIRow',
                  data: {
                    source: 'dummyjson.cart.list',
                    filter: 'user_id = 1',
                    loading_state: {
                      component: 'Skeleton',
                      props: { shape: 'card', count: 3 },
                      children: [],
                    },
                    empty_state: {
                      component: 'EmptyState',
                      props: {
                        title: 'Your cart is empty',
                        body: 'Add a product on /browse to see it here.',
                      },
                      children: [],
                    },
                    error_state: ERROR_STATE_NODE,
                  },
                  props: { density, variant: 'accent' as const },
                  children: [],
                },
                {
                  component: 'List',
                  data: {
                    source: 'dummyjson.cart.list',
                    filter: 'user_id = 1',
                    loading_state: SKELETON_NODE,
                    empty_state: {
                      component: 'EmptyState',
                      props: {
                        title: 'Your cart is empty',
                        body: 'Browse the catalog and tap "Add to cart" — items show up here with a 5s undo toast.',
                      },
                      children: [],
                    },
                    error_state: ERROR_STATE_NODE,
                  },
                  actions: ['dummyjson.cart.remove'],
                  props: {
                    density,
                    variant: 'bordered',
                    selectable: true,
                    bulkActions: [
                      {
                        id: 'dummyjson.cart.remove',
                        label: 'Remove selected',
                        variant: 'destructive' as const,
                        confirmation: 'modal' as const,
                      },
                    ],
                  },
                  children: [],
                },
                REVERSIBILITY_BAR_NODE,
                {
                  component: 'Button',
                  props: {
                    variant: 'primary' as const,
                    size: 'lg' as const,
                    label: 'Checkout',
                    href: '/checkout',
                  },
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
                STATUS_BAR_NODE,
                // `Wizard` composes as a leaf in the components catalog,
                // so it sits as a sibling to `Form` (not a parent).
                // The runtime cross-binds the form steps to the wizard
                // by id at render time.
                {
                  component: 'Wizard',
                  props: {
                    variant: 'sidebar' as const,
                    steps: [
                      { id: 'shipping', label: 'Shipping', state: 'active' as const },
                      { id: 'payment', label: 'Payment', state: 'pending' as const },
                      { id: 'review', label: 'Review', state: 'pending' as const },
                    ],
                  },
                  children: [],
                },
                {
                  component: 'Form',
                  props: { variant: 'default' as const },
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
