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
  FallbackCompiler,
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
import { StreamingAuditSink, manifestContractsFromBindings } from '@cir/runtime';
import { COMPONENT_BINDINGS, COMPOSITION_RULES } from '@cir/components';
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

  const fallback = new FallbackCompiler({
    id: 'fallback-hand-written',
    lookup: (route) => manifestForRoute(route, current.density),
  });

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
  compilers.push(fallback);

  const compiler = new CompositeCompiler(compilers, {
    onCascade: (from, err) => {
      // eslint-disable-next-line no-console
      console.warn(`[cir-dummyjson] compiler ${from} failed; cascading. err:`, err);
    },
  });

  const store = new MemoryManifestStore({ maxEntries: 200 });

  const resolver = new ServerManifestResolver({
    compiler,
    store,
    audit: (e) => audit.emit(e),
  });

  // Components catalog summary — what the compiler is allowed to reference.
  //
  // Per `docs/ethos.md` principle #2 (composition, not invention), every
  // entry carries a `description` so the LLM picks the right component.
  // Custom bindings (`ProductGrid`, `ProductDetail`, `CartItemList`, etc.)
  // describe the specific UX they ship; the compiler picks them over
  // generic `<Grid>` / `<List>` when the route's intent matches.
  const componentIds: Array<{ id: string; description: string }> = [
    {
      id: 'Stack',
      description: 'Vertical or horizontal layout container with gap. Wrap any group of children.',
    },
    {
      id: 'Card',
      description:
        'Bordered or elevated content surface. Use for grouped content with a clear edge.',
    },
    {
      id: 'Container',
      description: 'Page-width container with maxWidth + padding. Top-level wrapper for routes.',
    },
    {
      id: 'Grid',
      description:
        'Generic responsive grid for tiles. For product browsing in this demo, prefer `ProductGrid` which is density-aware and renders rich product cards.',
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
        'Status pill with operational/degraded/down. Marigold uses `RateLimitChip` for rate-limit state — pick that when surfacing a rate-limited capability.',
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
      description: 'Top nav with brand + items. Pair with `RateLimitChip` for the chrome row.',
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
    // Custom bindings shipped in `apps/demo-dummyjson/components/`.
    {
      id: 'MarigoldHeader',
      description:
        'Single-row chrome (Wordmark + nav + small rate-limit chip). USE THIS as the FIRST child of every route. Replaces a Stack of NavBar+RateLimitChip — there should be exactly one MarigoldHeader per manifest. Do NOT compose NavBar yourself; MarigoldHeader handles that internally.',
    },
    {
      id: 'ProductCard',
      description:
        'Single-product rich card: image, brand caps, title, star rating, bold price (with strikethrough on original), green Save% badge, orange Add-to-cart. Density-aware. Used by ProductGrid; rarely placed by the manifest directly.',
    },
    {
      id: 'ProductGrid',
      description:
        "Density-aware product grid wrapping `ProductCard`. Reads `density` from intent profile: compact = single-column compact list, comfortable = 3-column card grid, spacious = 2-column oversized grid. PREFER this over `<Grid>` for `/browse`. Bind `data: { source: 'dummyjson.product.list' }`.",
    },
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
    {
      id: 'RateLimitChip',
      description:
        'Small inline rate-limit indicator (e.g. "60 cart adds / 60s"). Place in chrome header for any route surfacing a rate-limited action. Satisfies `rate_limited_actions_show_state` policy.',
    },
    {
      id: 'Wordmark',
      description:
        'Marigold parcel-ribbon SVG + "DummyJSON Shop" lockup. Place at the start of chrome row.',
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
  // it exercises the most catalog vocabulary (MarigoldHeader, ProductGrid,
  // RateLimitChip, etc.) and satisfies every policy.
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
