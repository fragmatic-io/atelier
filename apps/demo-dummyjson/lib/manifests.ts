// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
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
 * Marketplace pivot — closing chapter. All three demos now ship zero
 * custom bindings; the per-route bodies compose pure baseline primitives
 * from `@atelier/components`:
 *
 *   - `/browse` — `<Grid data={products}>` over a single `<Card>` template
 *     child. The Grid threads each item as the Card's `data` prop; the
 *     Card derives tile fields from the product shape automatically. The
 *     runtime resolves `actions: [...]` through `actionSlots: ['onAction']`
 *     on Grid and forwards onto each Card.
 *   - `/product/[id]` — a horizontal `<Stack>` of `<Gallery data={product}>`
 *     (data-aware: the Gallery derives one image per `product.images[i]`),
 *     a tile-shaped `<Card data={product}>` with the add-to-cart action,
 *     and a `<DetailView fields={...}>` for description / brand / category.
 *     A baseline `<List>` rail underneath surfaces recommendations.
 *   - `/cart` — a `<Queue data={cart.products}>` of line items with a
 *     declarative remove action, plus a totals/checkout footer composed
 *     from `<Markdown>` + `<Button>`.
 *   - `/checkout` — a baseline `<Wizard>` with three step bodies (each a
 *     `<Form>` of `<TextInput>`s). Step state lives in the host's React
 *     tree; the manifest declares the static three-step structure.
 *
 * The off-screen `REVERSIBILITY_ANCHOR_NODE` is gone — reversibility is
 * surfaced ambiently by the `<UndoToast>` mounted at the app root by
 * `<CirProviders>`, declared as an `AmbientPolicySatisfier` for
 * `reversibility_surfaced`. The chrome `<StatusBar>` carries the
 * `dummyjson.cart.add.rate_limit` binding to satisfy
 * `rate_limited_actions_show_state` (also covered ambiently).
 *
 * Trade-offs accepted (per `docs/ethos.md` review checklist):
 *
 *   - The retired `<ProductDetail>` shipped a 5-star rating row, a
 *     thumbnail strip below the primary image, a strike-through original
 *     price beside the discounted price, and a qty NumberInput beside the
 *     add-to-cart button. Baseline `<Card>` defaults to a single bold
 *     price + save badge across densities; the qty selector is dropped
 *     until `<Card>` (or a host-supplied per-tile slot) gains an inline
 *     NumberInput pattern. Acceptable trade per principle #11.
 *   - The retired `<CartItemList>` rendered a pretty totals/savings card
 *     with a strike-through subtotal beside the discounted total. The
 *     baseline `<Markdown>` line carries the subtotal verbatim; richer
 *     totals come back when a `<Card>` totals slot ships.
 *   - The retired `<CheckoutWizard>` shipped a sidebar layout (Vis-4
 *     wizard variants table). Baseline `<Wizard>` ships an inline
 *     stepper today. The step structure and progressive disclosure are
 *     preserved; the sidebar comes back when `<Wizard variant="sidebar">`
 *     gains the same data-driven step body wiring `<Wizard>` already has.
 */

import type { LayoutNode, Manifest } from '@atelier/schemas';
import type { Density } from '@atelier/components';

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
// `AmbientPolicySatisfier`s in `atelier-providers.tsx`, so the policy clears
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

  // The single-product binding the resolver hits to populate Gallery + Card +
  // DetailView. All three baseline nodes share the same `data: { source, filter }`
  // — the React render walker resolves once per node, but they're all bound to
  // the same upstream URL so the dataResolver's in-flight dedupe collapses them
  // into one fetch. Distinctive empty: "Product not found in catalog."
  const productDataBinding = {
    source: 'dummyjson.product.list',
    filter: `id = ${id}`,
    empty_state: {
      component: 'EmptyState' as const,
      props: {
        title: 'Product not found',
        description: 'That id isn’t in the catalog. Try /browse.',
      },
      children: [] as LayoutNode[],
    },
  };

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
                // Two-column layout: gallery (left) + card-with-actions
                // and detail fields (right). All three nodes resolve the
                // same single-product binding; data-aware Gallery derives
                // images from `product.images[]`, the Card defaults its
                // tile fields from the product shape, and DetailView's
                // `fields` prop maps to the same item.
                {
                  component: 'Stack',
                  props: { direction: 'horizontal' as const, gap: 'lg' as const, density },
                  children: [
                    {
                      component: 'Gallery',
                      data: productDataBinding,
                      props: { columns: 1, variant: 'grid' as const },
                      children: [],
                    },
                    {
                      component: 'Stack',
                      props: { direction: 'vertical' as const, gap: 'md' as const, density },
                      children: [
                        {
                          component: 'Card',
                          data: productDataBinding,
                          actions: ['dummyjson.cart.add'],
                          props: {
                            variant: 'bordered' as const,
                            actions: [
                              {
                                id: 'dummyjson.cart.add',
                                label: 'Add to cart',
                                variant: 'primary' as const,
                              },
                            ],
                          },
                          children: [],
                        },
                        {
                          component: 'DetailView',
                          data: productDataBinding,
                          props: {
                            fields: [
                              { id: 'description', label: 'Description' },
                              { id: 'brand', label: 'Brand' },
                              { id: 'category', label: 'Category' },
                              { id: 'stock', label: 'In stock' },
                              { id: 'rating', label: 'Rating' },
                            ],
                            variant: 'tinted' as const,
                          },
                          children: [],
                        },
                      ],
                    },
                  ],
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
                // Cart line items as a baseline `<Queue>`. Data-aware:
                // the Queue renders one row per item from `data` (an
                // array). The dummyjson cart envelope is `{ carts: [{
                // products: [...] }] }`; the resolver flattens to the
                // products list. Per-row "Remove" button is wired
                // through `actionSlots: ['onAction']` on Queue.
                //
                // Trade-off: the qty selector previously rendered per
                // row in `<CartItemList>` is dropped — `<Queue>` has
                // no inline NumberInput slot today. Cart's primary
                // affordances (line items, remove, checkout) are
                // preserved; qty editing returns when Queue (or a
                // host's per-row form slot) gains an inline-form pattern.
                {
                  component: 'Queue',
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
                  actions: ['dummyjson.cart.remove'],
                  props: {
                    title: 'Your cart',
                    actions: [
                      {
                        id: 'dummyjson.cart.remove',
                        label: 'Remove',
                        variant: 'ghost' as const,
                      },
                    ],
                    variant: 'bordered' as const,
                    density,
                  },
                  children: [],
                },
                // Totals + checkout footer composed from baseline
                // `<Markdown>`. The subtotal line is host-folded from
                // the cart data binding once a totals slot lands; today
                // the line carries a static prompt and an inline link
                // to /checkout. Trade-off: the previous design rendered
                // a designed totals card with strike-through savings;
                // baseline doesn't ship that surface yet.
                {
                  component: 'Markdown',
                  props: {
                    content:
                      '**Subtotal** — review line items above. Ready when you are: [Continue to checkout](/checkout).',
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
  // Three checkout steps composed as a stack of `<Form>`s with section
  // headings. Baseline `<Wizard>` consumes its `steps` via a typed
  // `steps: WizardStep[]` prop where `content: ReactNode` — manifests
  // are JSON, so a manifest cannot supply ReactNode step content. Until
  // `<Wizard>` accepts a children-as-step-bodies form (or a
  // step-data binding), the simpler Stack-of-Forms version is the
  // closest pure-baseline composition.
  //
  // Trade-off: the retired `<CheckoutWizard>` ran step-progression in
  // host React state (Shipping → Payment → Review with each step
  // hidden until the previous submit). The Stack version shows all
  // three sections inline; progressive disclosure returns when
  // `<Wizard>` becomes manifest-driveable. The user-visible step
  // structure (three labelled forms; place-order at the bottom) is
  // preserved.
  const stepHeader = (n: number, label: string, prompt: string): LayoutNode => ({
    component: 'Stack',
    props: { direction: 'vertical' as const, gap: 'sm' as const, density },
    children: [
      {
        component: 'Markdown',
        props: { content: `### Step ${String(n)} — ${label}`, variant: 'heading' as const },
        children: [],
      },
      {
        component: 'Markdown',
        props: { content: prompt, variant: 'muted' as const },
        children: [],
      },
    ],
  });

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
                stepHeader(1, 'Shipping', 'Where should we send your order?'),
                {
                  component: 'Form',
                  props: { submitLabel: 'Continue to payment' },
                  children: [
                    {
                      component: 'TextInput',
                      props: { label: 'Full name', name: 'name', required: true },
                      children: [],
                    },
                    {
                      component: 'TextInput',
                      props: { label: 'Address', name: 'address1', required: true },
                      children: [],
                    },
                    {
                      component: 'TextInput',
                      props: { label: 'City', name: 'city', required: true },
                      children: [],
                    },
                    {
                      component: 'TextInput',
                      props: { label: 'Postal code', name: 'postal', required: true },
                      children: [],
                    },
                    {
                      component: 'TextInput',
                      props: { label: 'Country', name: 'country' },
                      children: [],
                    },
                  ],
                },
                stepHeader(2, 'Payment', 'Card details — demo only, never sent.'),
                {
                  component: 'Form',
                  props: { submitLabel: 'Review order' },
                  children: [
                    {
                      component: 'TextInput',
                      props: {
                        label: 'Card number',
                        name: 'card',
                        placeholder: '4242 4242 4242 4242',
                      },
                      children: [],
                    },
                    {
                      component: 'TextInput',
                      props: { label: 'Expiry', name: 'expiry', placeholder: 'MM/YY' },
                      children: [],
                    },
                    {
                      component: 'TextInput',
                      props: { label: 'CVC', name: 'cvc', placeholder: '123' },
                      children: [],
                    },
                  ],
                },
                stepHeader(
                  3,
                  'Review',
                  'Take one last look — placing the order is reversible up to dispatch.',
                ),
                {
                  component: 'Form',
                  props: { submitLabel: 'Place order' },
                  children: [
                    {
                      component: 'Markdown',
                      props: {
                        content:
                          'Confirming your order locks in shipping and payment. The undo toast covers any reversible action up to dispatch.',
                      },
                      children: [],
                    },
                  ],
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
