// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Server-side singleton for the dummyjson catalog demo: real compiler +
 * Tier-3 cache + audit. Survives hot reload via `globalThis`.
 *
 * Differs from `apps/demo/lib/cir-server.ts` in two ways:
 *  1. The fallback `lookup` is **lens-aware** — it reads density off a
 *     server-bound `IntentProfile` (default `'comfortable'`) so the same
 *     route resolves to three distinct manifests across compact / cozy /
 *     spacious.
 *  2. The capability registry is dummyjson-only (catalog + cart). No
 *     thread / task surface.
 */

import {
  CompositeCompiler,
  GenericFallbackCompiler,
  GeminiCompiler,
  MemoryManifestStore,
  ServerManifestResolver,
  type CompilerService,
  type ManifestStore,
} from '@cir/compiler';
import {
  composesAccordingTo,
  emptyLoadingErrorHandled,
  manifestComponentContractSatisfied,
  rateLimitedActionsShowState,
  reversibilitySurfaced,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
  UNDO_TOAST_AMBIENT_SATISFIER,
  type AmbientPolicySatisfier,
} from '@cir/policies';
import { StreamingAuditSink } from '@cir/runtime';
import { COMPOSITION_RULES } from '@cir/components/composition-rules';
import type { Capability, ComponentDefinition, IntentProfile, Manifest } from '@cir/schemas';
import type { Density } from '@cir/components';
import { DUMMYJSON_BRAND_KIT } from './brand-kit.js';
import { CAPABILITIES } from './capabilities.js';
import { manifestForRoute } from './manifests.js';

/**
 * Ambient satisfiers (Phase 2 #5) — declarations of which runtime services
 * cover which policy obligations. Mirrors `lib/cir-providers.tsx` so the
 * LLM-side validation cascade and the client-side validation cascade
 * agree on what is satisfied without manifest-level evidence.
 */
const AMBIENT_POLICY_SATISFIERS: readonly AmbientPolicySatisfier[] = [
  UNDO_TOAST_AMBIENT_SATISFIER,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
];

/**
 * Run composition + empty/loading/error policies on the LLM's output before
 * the manifest reaches the renderer. The Gemini validate hook treats any
 * violation as a `CompilerOutputError`, which the composite cascades on.
 * See `docs/ethos.md` principles 1, 4, 5.
 */
// Per-binding manifest contracts the policy validates against. Empty here
// because the demo's custom bindings live in a client-side module that
// can't be pulled into this server-side route, and importing the
// baseline `COMPONENT_BINDINGS` from `@cir/components` drags client-only
// React contexts into the Next bundle. The policy is additive — bindings
// without a contract are silently skipped — so passing an empty map is
// safe. Phase 3 follow-up: lift baseline contracts into a server-safe
// catalog so they're enforceable at compile time too.
const MANIFEST_CONTRACTS = {} as const;

function validateManifestSemantics(manifest: Manifest): { errors: readonly string[] } {
  const policies = [
    composesAccordingTo(COMPOSITION_RULES),
    emptyLoadingErrorHandled,
    rateLimitedActionsShowState,
    reversibilitySurfaced,
    manifestComponentContractSatisfied(MANIFEST_CONTRACTS),
  ];
  // Compute rate-limited capability ids from the registry so the policy
  // walker recognises which actions need a visible quota indicator.
  // Excludes capabilities that are themselves rate-limit data sources
  // (`*.rate_limit`) since they ARE the indicator. Excludes cart.remove
  // because it shares a visual chip with cart.add — both rates are
  // surfaced in the same `<MarigoldHeader>` chip.
  const rateLimitedIds = new Set<string>();
  for (const [id, cap] of Object.entries(CAPABILITIES)) {
    if (id.endsWith('.rate_limit')) continue;
    if (id === 'dummyjson.cart.remove') continue;
    if (typeof cap.rate_limit === 'string' && cap.rate_limit.length > 0) {
      rateLimitedIds.add(id);
    }
  }
  const ctx = {
    manifest,
    capabilities: CAPABILITIES,
    components: {},
    rate_limited_capability_ids: rateLimitedIds,
    pii_fields: new Set<string>(),
    intent: {
      user_id: 'demo-user',
      global_preferences: {},
      granted_fields: [] as string[],
    },
    // Ambient satisfiers — chrome rate-limit chip + ambient undo toast.
    // Mirrors `cir-providers.tsx`: lets the LLM omit per-route quota /
    // rollback anchor nodes since the chrome already covers them.
    ambient_policy_satisfiers: AMBIENT_POLICY_SATISFIERS,
  };
  const errors: string[] = [];
  for (const policy of policies) {
    const result = policy.evaluate(ctx);
    // Phase 2 #4 — only `error`/`warn` violations gate the LLM's retry loop.
    // `info` advisories (e.g. "the resolver will supply a default empty
    // state") are fine to leave on the table; the runtime fills them in.
    for (const v of result.violations) {
      if (v.severity === 'info') continue;
      errors.push(v.message);
    }
  }
  return { errors };
}

interface CirServer {
  compiler: CompilerService;
  store: ManifestStore;
  audit: StreamingAuditSink;
  resolver: ServerManifestResolver;
  capabilities: Record<string, Capability>;
  components: ComponentDefinition[];
  brandKit: typeof DUMMYJSON_BRAND_KIT;
  geminiAvailable: boolean;
  /** Concrete few-shot manifest the API route forwards as `CompileInput.fewShotExample`. */
  fewShotExample: Manifest;
  /**
   * The currently-active lens. The manifest endpoint mirrors a request
   * header (`x-cir-density`) into this slot before resolving so the
   * fallback compiler picks the right variant.
   */
  density: Density;
}

const KEY = '__cir_demo_dummyjson_server';
type GlobalWithServer = typeof globalThis & { [KEY]?: CirServer };
const g = globalThis as GlobalWithServer;

function buildServer(): CirServer {
  const audit = new StreamingAuditSink({ bufferSize: 200, echoToConsole: false });

  const apiKey = process.env['GEMINI_API_KEY'];
  const geminiAvailable = !!apiKey && apiKey.length > 10;

  // Lens slot — lookup closes over `current.density` so that updates between
  // requests pick up immediately. Never mutated by `lookup` itself.
  const current = { density: 'comfortable' as Density };

  // Phase 3 polish — the demo no longer ships its own per-route fallback.
  // The framework's `GenericFallbackCompiler` synthesizes a humble valid
  // manifest when Gemini is unavailable. Per `docs/ethos.md` principle #1,
  // the demo should rely on the LLM end-to-end, not fall back to
  // hand-written content that masks LLM failures. `lib/manifests.ts` is
  // retained ONLY as the source of `fewShotExample` (host-supplied
  // grounding for the LLM) and as fixture for tests — it is no longer
  // wired into the compile chain.
  const compilers: CompilerService[] = [];
  if (geminiAvailable) {
    compilers.push(
      new GeminiCompiler({
        apiKey: apiKey!,
        coldModel: process.env['GEMINI_COLD_MODEL'] ?? 'gemini-2.5-pro',
        diffModel: process.env['GEMINI_DIFF_MODEL'] ?? 'gemini-2.5-flash',
        validate: validateManifestSemantics,
      }),
    );
  }
  compilers.push(new GenericFallbackCompiler());

  const compiler = new CompositeCompiler(compilers, {
    onCascade: (from, err) => {
      // eslint-disable-next-line no-console
      console.warn(`[cir-dummyjson] compiler ${from} failed; cascading. err:`, err);
    },
  });

  const store = new MemoryManifestStore({ maxEntries: 200 });

  // Phase 3 polish: density-keyed cache. The default `buildKey` doesn't
  // include lens density, so a `LensSwitcher` flip persists in
  // localStorage but the cached manifest serves the prior variant. We
  // override `buildKey` to fold the active density into the cache key
  // (via `intent_profile_version`) so a lens change is a guaranteed
  // miss → fresh compile → user sees the layout reshape.
  const resolver = new ServerManifestResolver({
    compiler,
    store,
    audit: (e) => audit.emit(e),
    buildKey: (input) => {
      let capabilityVersion: string | undefined;
      for (const c of Object.values(input.capabilities)) {
        if (c.version && (!capabilityVersion || c.version > capabilityVersion)) {
          capabilityVersion = c.version;
        }
      }
      return {
        user_id: input.user_id,
        app_id: input.app_id,
        route: input.route,
        capability_version: capabilityVersion,
        // Density gets folded into intent_profile_version so the cache
        // treats `comfortable` / `compact` / `spacious` as different
        // manifests for the same route. The encoding is opaque to the
        // cache — only equality matters.
        intent_profile_version:
          current.density === 'compact' ? 1 : current.density === 'spacious' ? 3 : 2,
        brand_kit_version: input.brandKit?.version,
      };
    },
  });

  // Components catalog summary — what the compiler is allowed to reference.
  //
  // Per `docs/ethos.md` principle #2 (composition, not invention), every
  // entry carries a `description` so the LLM picks the right component.
  // Custom bindings (`ProductDetail`, `CartItemList`, `CheckoutWizard`)
  // describe the specific UX they ship; the compiler picks them over
  // generic `<DetailView>` / `<List>` / `<Wizard>` when the route's
  // intent matches. `ProductCard` / `ProductGrid` were retired in the
  // marketplace pivot — the compiler now composes `<Grid data={...}>` +
  // `<Card>` directly.
  const componentIds: Array<{ id: string; description: string }> = [
    {
      id: 'Stack',
      description: 'Vertical or horizontal layout container with gap. Wrap any group of children.',
    },
    {
      id: 'Card',
      description:
        'Bounded content surface. Two compositions: (1) legacy bordered surface with `title` + ' +
        'children body; (2) self-contained tile with `image`, `title`, `subtitle`, `price`, `badge`, ' +
        'and a footer row of declarative `actions: CardAction[]` buttons. When rendered as a child ' +
        'of `<Grid data={items}>`, the runtime threads the row item via `data`; the Card defaults ' +
        'each tile field from common product-shape fields (`title`, `brand`, `thumbnail`, ' +
        '`images[0]`, `price`, `discountPercentage`). For product browsing in this demo, COMPOSE ' +
        '`<Grid data={...}>` over a single `<Card>` template child rather than authoring a custom ' +
        'wrapper.',
    },
    {
      id: 'Container',
      description: 'Page-width container with maxWidth + padding. Top-level wrapper for routes.',
    },
    {
      id: 'Grid',
      description:
        'CSS grid primitive. Data-aware: when `data` (resolver-supplied array) is bound, the Grid ' +
        'renders one cell per item. Declare a single `<Card>` child as the per-item template (the ' +
        'runtime clones it per item, threading the item via `data`); or omit children to default- ' +
        'render each item as a tile-shaped Card. For `/browse`, bind `data: { source: ' +
        "'dummyjson.product.list' }` and supply a single `<Card>` child with " +
        "`actions: [{id: 'dummyjson.cart.add', ...}]` — per-item dispatch is wired by the runtime.",
    },
    {
      id: 'List',
      description:
        'Generic semantic <ul>. For shopping cart, prefer `CartItemList`. Use `<List>` for related-products rails or generic recommendations.',
    },
    {
      id: 'Markdown',
      description: 'Rich-text body. Use for headings, descriptions, and prose copy.',
    },
    {
      id: 'Table',
      description: 'Generic dense rows with columns. Rare in this demo — most data is products.',
    },
    {
      id: 'EmptyState',
      description:
        'Standalone empty-state with title + body. Used as `empty_state` slot or sibling to a data binding.',
    },
    {
      id: 'Button',
      description:
        "Primary action affordance. Carries one capability id in `actions`. For 'Add to cart' inside a card, the binding wires it; the manifest only declares `actions`.",
    },
    {
      id: 'TextInput',
      description:
        'Single-line text input. Pair with `<Form>` for submission (e.g. shipping form).',
    },
    {
      id: 'Select',
      description: 'Dropdown selection. For shipping country, payment method, etc.',
    },
    {
      id: 'Alert',
      description:
        'Inline severity-flagged message. Use for `error_state` slots or persistent notices.',
    },
    { id: 'Spinner', description: 'Indeterminate loading affordance.' },
    {
      id: 'Skeleton',
      description:
        'Loading-state placeholder shapes (card, row, line). Use as `loading_state` slot.',
    },
    {
      id: 'StatusBar',
      description:
        'Status pill with operational / degraded / down. Bind to `dummyjson.cart.add.rate_limit` in the chrome to surface the cart-add quota live; ambient `RATE_LIMIT_CHIP_AMBIENT_SATISFIER` clears the `rate_limited_actions_show_state` policy.',
    },
    {
      id: 'Logo',
      description:
        'Brand mark + wordmark primitive. For Marigold pass `glyph: "\\u{1F33C}"` (marigold flower) and `wordmark: "marigold"`. Compose as a sibling of `<NavBar>` and `<StatusBar>` inside a `<Stack>` to build the chrome — there is no `<MarigoldHeader>` / `<Wordmark>` custom any more.',
    },
    {
      id: 'Search',
      description: 'Search input with debounced submit. Top of `/browse` to filter products.',
    },
    {
      id: 'FilterBar',
      description: 'Filter chips/dropdowns above a list. variant=chip for selectable categories.',
    },
    { id: 'Pagination', description: 'Pagination controls (Prev / page numbers / Next).' },
    { id: 'Tooltip', description: 'Hover popover for inline help.' },
    {
      id: 'HoverCard',
      description: 'Hoverable preview surface. Use for inline reference previews.',
    },
    {
      id: 'BulkActionBar',
      description:
        'Bottom-center action bar that auto-mounts when a `selectable` List has rows selected.',
    },
    {
      id: 'Toast',
      description:
        'Transient notification. Prefer `<UndoToast>`-equivalent for reversible actions.',
    },
    {
      id: 'NavBar',
      description:
        'Top nav with `items`. Compose with `<Logo>` and `<StatusBar>` inside a horizontal `<Stack>` to build the Marigold chrome — there is no per-host header binding any more.',
    },
    { id: 'KPIRow', description: 'Horizontal row of stat cards. Rare in this demo.' },
    {
      id: 'Wizard',
      description:
        'Multi-step process indicator (Shipping → Payment → Review). For checkout, prefer `CheckoutWizard` which is data-aware.',
    },
    { id: 'Form', description: 'Form root with submit semantics. Wraps inputs.' },
    {
      id: 'DetailView',
      description:
        'Single-record detail surface. For products, prefer `ProductDetail` which adds gallery + qty + add-to-cart.',
    },
    { id: 'Gallery', description: 'Image gallery / carousel. Used inside ProductDetail.' },
    { id: 'StatCard', description: 'Single KPI card. Rare in this demo.' },
    // Custom bindings shipped in `apps/demo-dummyjson/components/`. Five
    // have been retired in the marketplace pivot — `MarigoldHeader`,
    // `Wordmark`, and `RateLimitChip` collapsed onto
    // `<Stack(Logo, NavBar, StatusBar)>` composition; `ProductCard` and
    // `ProductGrid` collapsed onto `<Grid data={items}>` + `<Card>`
    // template composition.
    {
      id: 'ProductDetail',
      description:
        "Rich product detail page: gallery + info + qty + add-to-cart. PREFER over `<DetailView>` for `/product/[id]`. Bind `data: { source: 'dummyjson.product.list', filter: 'id = …' }`.",
    },
    {
      id: 'CartItemList',
      description:
        "Cart line items with image + qty + remove + totals + designed empty state. PREFER over `<List>` for `/cart`. Bind `data: { source: 'dummyjson.cart.list' }`.",
    },
    {
      id: 'CheckoutWizard',
      description:
        'Three-step Shipping/Payment/Review with progressive disclosure. PREFER over `<Wizard>` for `/checkout`.',
    },
  ];
  const components: ComponentDefinition[] = componentIds.map((c) => ({
    id: c.id,
    description: c.description,
    props_schema: `${c.id}Props`,
    data_sources: [],
    actions_supported: [],
    responsive_targets: ['web'],
    design_tokens: '@cir/demo-dummyjson/brand@0.1.0',
    examples: [],
    text_render: true,
  }));

  // Use the canonical /browse manifest as the LLM's few-shot grounding —
  // it exercises baseline composition (Stack, Logo, NavBar, StatusBar,
  // Grid+Card tile pattern) and satisfies every policy.
  const fewShotExample = manifestForRoute('/browse', current.density);
  if (!fewShotExample) {
    throw new Error('demo-dummyjson: no manifest available to use as few-shot example');
  }

  return {
    compiler,
    store,
    audit,
    resolver,
    capabilities: CAPABILITIES,
    components,
    brandKit: DUMMYJSON_BRAND_KIT,
    geminiAvailable,
    fewShotExample,
    get density(): Density {
      return current.density;
    },
    set density(value: Density) {
      current.density = value;
    },
  };
}

export function getCirServer(): CirServer {
  if (!g[KEY]) g[KEY] = buildServer();
  return g[KEY];
}

/**
 * Pull a `Density` value off the request header (set by the route gate
 * client-side from the loaded `IntentProfile`). Defaults to `comfortable`.
 */
export function densityFromRequest(req: Request): Density {
  const raw = req.headers.get('x-cir-density');
  if (raw === 'compact' || raw === 'spacious' || raw === 'comfortable') return raw;
  return 'comfortable';
}

/** Convenience: derive a `Density` from a server-side intent profile. */
export function densityFromProfile(profile: IntentProfile | null | undefined): Density {
  const raw = profile?.global_preferences['density'];
  if (raw === 'compact' || raw === 'spacious' || raw === 'comfortable') return raw;
  return 'comfortable';
}
