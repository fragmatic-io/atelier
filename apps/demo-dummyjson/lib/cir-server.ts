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
import { StreamingAuditSink } from '@cir/runtime';
import type { Capability, ComponentDefinition, IntentProfile } from '@cir/schemas';
import type { Density } from '@cir/components';
import { DUMMYJSON_BRAND_KIT } from './brand-kit.js';
import { CAPABILITIES } from './capabilities.js';
import { manifestForRoute } from './manifests.js';

interface CirServer {
  compiler: CompilerService;
  store: ManifestStore;
  audit: StreamingAuditSink;
  resolver: ServerManifestResolver;
  capabilities: Record<string, Capability>;
  components: ComponentDefinition[];
  brandKit: typeof DUMMYJSON_BRAND_KIT;
  geminiAvailable: boolean;
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
  // Includes the demo's custom bindings (ProductGrid, ProductDetail, …) so
  // the Gemini compiler is allowed to compose them. The runtime registry in
  // `cir-providers.tsx` knows the actual factories.
  const componentIds = [
    'Stack',
    'Card',
    'Container',
    'Grid',
    'List',
    'Markdown',
    'Table',
    'EmptyState',
    'Button',
    'TextInput',
    'Select',
    'Alert',
    'Spinner',
    'Skeleton',
    'StatusBar',
    'Search',
    'FilterBar',
    'Pagination',
    'Tooltip',
    'HoverCard',
    'BulkActionBar',
    'Toast',
    'NavBar',
    'KPIRow',
    'Wizard',
    'Form',
    'DetailView',
    'Gallery',
    'StatCard',
    // Custom bindings shipped in `apps/demo-dummyjson/components/`.
    'ProductCard',
    'ProductGrid',
    'ProductDetail',
    'CartItemList',
    'CheckoutWizard',
    'RateLimitChip',
    'Wordmark',
  ];
  const components: ComponentDefinition[] = componentIds.map((id) => ({
    id,
    props_schema: `${id}Props`,
    data_sources: [],
    actions_supported: [],
    responsive_targets: ['web'],
    design_tokens: '@cir/demo-dummyjson/brand@0.1.0',
    examples: [],
    text_render: true,
  }));

  return {
    compiler,
    store,
    audit,
    resolver,
    capabilities: CAPABILITIES,
    components,
    brandKit: DUMMYJSON_BRAND_KIT,
    geminiAvailable,
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
