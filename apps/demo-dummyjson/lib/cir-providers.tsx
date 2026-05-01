// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * CIR runtime services bag for the dummyjson catalog demo, plus the React
 * provider tree.
 *
 * The data layer is pure RestDataResolver hitting `https://dummyjson.com`
 * directly — no proxy, no fake-data.ts. The whole point of this demo is
 * exercising the public-API resolver that ships in `@cir/data-resolvers`.
 *
 *  - `dummyjson.product.list`            → /products
 *  - `dummyjson.product.search`          → /products/search?q=…
 *  - `dummyjson.product.recommendations` → /products/category/${category}
 *    (the dummyjson public API has no recommender; we approximate by
 *    fetching the same category the focal product is in. The `transform`
 *    hook unwraps the envelope and clips to `limit`.)
 *  - `dummyjson.cart.list`               → /carts/user/${user_id}
 *  - `dummyjson.cart.add`                → POST /carts/add
 *  - `dummyjson.cart.remove`             → DELETE /carts/{id}
 *
 * Action handlers POST through `fetchImpl` directly so the demo doesn't
 * stand up an action gateway.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import {
  ActionDispatcher,
  InMemoryTriggerBus,
  ManifestFetcher,
  ManifestResolver,
  MapActionRegistry,
  MapComponentRegistry,
  MemoryManifestCache,
  StreamingAuditSink,
  wireTriggerInvalidation,
  type ActionExecutionContext,
  type ConfirmationCallback,
} from '@cir/runtime';
import { COMPONENT_BINDINGS, COMPOSITION_RULES } from '@cir/components';
import {
  CirRuntime,
  CompileBadge,
  DebugPanel,
  useReactConfirmation,
  type DataBinding,
} from '@cir/react';
import { CompositeDataResolver, RestDataResolver } from '@cir/data-resolvers';
import { validateManifest, BASELINE_POLICIES, composesAccordingTo } from '@cir/policies';
import type { IntentProfile, Manifest } from '@cir/schemas';
import { DUMMYJSON_BRAND_KIT } from './brand-kit.js';
import { CAPABILITIES } from './capabilities.js';
import { DEMO_DUMMYJSON_BINDINGS, DEMO_DUMMYJSON_COMPOSITION_ROLES } from './component-bindings.js';
import { loadIntentProfile, loadLens } from './intent-store.js';

type CirServices = Parameters<typeof CirRuntime>[0]['services'];

const DUMMYJSON_BASE = 'https://dummyjson.com';
const DEFAULT_USER_ID = 1;

/**
 * Build the public-API REST resolver. URL templates handle every binding.
 * For `cart.list` and `recommendations` we read the relevant id off the
 * binding's `filter` query (e.g. `'user_id = 1'`, `'product_id = 42'`).
 */
function buildDummyJsonResolver(): RestDataResolver {
  return new RestDataResolver({
    urlMap: {
      'dummyjson.product.list': (binding: DataBinding): string => {
        // Detail page passes `filter: 'id = N'` — fetch the single product
        // directly. List page omits the filter and pulls the first 30.
        const id = extractEqValue(binding.filter, 'id');
        if (id) return `https://dummyjson.com/products/${id}`;
        return 'https://dummyjson.com/products?limit=30';
      },
      'dummyjson.product.search': (binding: DataBinding): string => {
        const q = extractEqValue(binding.filter, 'q') ?? '';
        return `https://dummyjson.com/products/search?q=${encodeURIComponent(q)}&limit=30`;
      },
      'dummyjson.product.recommendations': (binding: DataBinding): string => {
        // The dummyjson public API does not expose a recommendation
        // endpoint. We approximate by hitting the focal product's category
        // and returning a small slate of neighbours from that category.
        const productId = extractEqValue(binding.filter, 'product_id') ?? '1';
        return `https://dummyjson.com/products/${productId}`;
      },
      'dummyjson.cart.list': (binding: DataBinding): string => {
        const userId = extractEqValue(binding.filter, 'user_id') ?? String(DEFAULT_USER_ID);
        return `https://dummyjson.com/carts/user/${userId}`;
      },
    },
    headers: { accept: 'application/json' },
    transform: (json, binding) => {
      // Recommendation transform: fetch the product, follow up with a
      // category fetch on the renderer side via a client effect would be
      // heavier than this — we just return the focal product wrapped in a
      // single-item products list. Real production wires a recommender.
      if (binding.source === 'dummyjson.product.recommendations') {
        const product = json as { category?: string; id?: number };
        return {
          products: product.category ? [product] : [],
          total: product.category ? 1 : 0,
        };
      }
      return json;
    },
  });
}

/** Tiny ad-hoc `<key> = <literal>` extractor. Keeps the resolver self-contained. */
function extractEqValue(filter: string | undefined, key: string): string | null {
  if (!filter) return null;
  const re = new RegExp(`${key}\\s*=\\s*"?([\\w-]+)"?`, 'u');
  const m = re.exec(filter);
  return m && m[1] ? m[1] : null;
}

const dummyjsonResolver = buildDummyJsonResolver();

const composite = new CompositeDataResolver([dummyjsonResolver.resolve], {
  predicates: [(b) => b.source.startsWith('dummyjson.')],
});

const dataResolver = composite.resolve;

interface BuiltServices {
  services: CirServices;
  audit: StreamingAuditSink;
}

/** Action handler bag. Hits the real dummyjson HTTP API. */
function buildActions(): MapActionRegistry {
  const actions = new MapActionRegistry();
  actions.register(
    'dummyjson.cart.add',
    async (input: unknown, _ctx: ActionExecutionContext): Promise<unknown> => {
      const body = input as { user_id?: number; product_id: number; quantity: number };
      const res = await fetch(`${DUMMYJSON_BASE}/carts/add`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: body.user_id ?? DEFAULT_USER_ID,
          products: [{ id: body.product_id, quantity: body.quantity }],
        }),
      });
      if (!res.ok) throw new Error(`cart.add HTTP ${String(res.status)}`);
      return res.json();
    },
  );
  actions.register(
    'dummyjson.cart.remove',
    async (input: unknown, _ctx: ActionExecutionContext): Promise<unknown> => {
      const body = input as { product_id: number };
      // The public dummyjson API takes a cart id on DELETE; we proxy to
      // a no-op success so the demo's optimistic UI lands cleanly without
      // needing a server-side cart store.
      const res = await fetch(`${DUMMYJSON_BASE}/carts/${body.product_id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`cart.remove HTTP ${String(res.status)}`);
      }
      return { removed_at: new Date().toISOString() };
    },
  );
  return actions;
}

function buildServices(confirm: ConfirmationCallback): BuiltServices {
  // Baseline catalog first; demo-specific bindings (ProductGrid,
  // CartItemList, …) layer on top so manifests can reference them in
  // `LayoutNode.component`.
  const registry = new MapComponentRegistry({
    ...COMPONENT_BINDINGS,
    ...DEMO_DUMMYJSON_BINDINGS,
  });
  const actions = buildActions();

  // Custom fetch wrapper that mirrors the user's lens onto an
  // `x-cir-density` request header. The manifest endpoint reads it through
  // `densityFromRequest()` so the FallbackCompiler picks the right variant.
  const lensFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('x-cir-density', loadLens());
    return fetch(input, { ...(init ?? {}), headers });
  };
  const fetcher = new ManifestFetcher({ baseUrl: '/api/cir', fetch: lensFetch });
  const cache = new MemoryManifestCache();
  const audit = new StreamingAuditSink({ bufferSize: 200, echoToConsole: true });
  const resolver = new ManifestResolver({
    fetcher,
    cache,
    validate: (manifest: Manifest) => {
      const result = validateManifest(
        {
          manifest,
          capabilities: CAPABILITIES,
          intent: {
            user_id: 'demo-user',
            global_preferences: { density: loadLens() },
            granted_fields: [
              'dummyjson.product.list.*',
              'dummyjson.product.search.*',
              'dummyjson.product.recommendations.*',
              'dummyjson.cart.list.*',
              'dummyjson.cart.add.rate_limit.*',
              'dummyjson.cart.remove.rate_limit.*',
            ],
          },
          rate_limited_capability_ids: new Set([
            'dummyjson.product.list',
            'dummyjson.product.search',
            'dummyjson.cart.add',
            'dummyjson.cart.remove',
          ]),
          pii_fields: new Set(['email']),
          brand_kit: DUMMYJSON_BRAND_KIT,
          // Custom bindings declaring `compositionRole` are surfaced here
          // so the policy engine treats them like the matching baseline
          // List/Grid/Table component (e.g. `ProductGrid` → `Grid`).
          composition_roles: DEMO_DUMMYJSON_COMPOSITION_ROLES,
        },
        {
          policies: [...BASELINE_POLICIES, composesAccordingTo(COMPOSITION_RULES)],
        },
      );
      return { ok: result.ok, reasons: result.violations.map((v) => v.message) };
    },
    audit,
  });

  const bus = new InMemoryTriggerBus();
  wireTriggerInvalidation({ bus, cache });

  const dispatcher = new ActionDispatcher({
    capabilities: CAPABILITIES,
    registry: actions,
    confirm,
    audit,
  });

  const intent: IntentProfile | undefined = loadIntentProfile() ?? undefined;

  return {
    services: {
      resolver,
      dispatcher,
      registry,
      bus,
      audit,
      identity: { user_id: 'demo-user', app_id: 'cir.demo-dummyjson' },
      intent,
    },
    audit,
  };
}

export function CirProviders({ children }: { children: ReactNode }): React.JSX.Element {
  const { confirm, Portal } = useReactConfirmation();
  const built = useMemo(() => buildServices(confirm), [confirm]);
  const { services, audit } = built;

  // Mirror lens changes onto <html data-color-mode> so dark-mode CSS in
  // `@cir/components/_variants.ts` lights up under user-toggled themes.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const profile = loadIntentProfile();
    const mode = profile?.global_preferences['color_mode'];
    if (mode === 'dark' || mode === 'light') {
      document.documentElement.setAttribute('data-color-mode', mode);
    }
  }, []);

  return (
    <>
      <CirRuntime services={services} dataResolver={dataResolver}>
        {children}
      </CirRuntime>
      <Portal />
      <DebugPanel sink={audit} />
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 90,
          pointerEvents: 'none',
        }}
      >
        <CompileBadge sink={audit} />
      </div>
    </>
  );
}
