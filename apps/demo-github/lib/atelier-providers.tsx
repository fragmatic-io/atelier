// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * Atelier runtime services bag for `apps/demo-github`. Mirrors the demo's
 * `atelier-providers.tsx` with three demo-specific tweaks:
 *
 *   1. The data resolver composes a fixture-backed `MockDataResolver` for
 *      `github.*` capabilities with a `RestDataResolver` that talks to
 *      `https://api.github.com` when a token is available. We build the
 *      fixture/REST decision per-binding so the same resolver instance
 *      handles "list me a repo (fixture)" and "list me a repo (live)"
 *      symmetrically.
 *
 *   2. The dispatcher registers four github actions: `issue.create`,
 *      `issue.close`, `issue.archive`, and `issue.bulk_close`. The first
 *      two POST to `/api/action/<id>`; the last two are client-only
 *      (archive is purely a view-state flip, bulk_close fans out to
 *      `issue.close` via the dispatcher).
 *
 *   3. The DebugPanel and CompileBadge mount only in development. The
 *      live audit panel is a Wave 7c / Cnt-9 affordance.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import {
  ActionDispatcher,
  actionSlotsFromBindings,
  compositionRolesFromBindings,
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
} from '@atelier/runtime';
import { COMPONENT_BINDINGS, COMPOSITION_RULES } from '@atelier/components';
import {
  CirRuntime,
  CompileBadge,
  DebugPanel,
  useReactConfirmation,
  type DataBinding,
} from '@atelier/react';
import { CompositeDataResolver, MockDataResolver, RestDataResolver } from '@atelier/data-resolvers';
import {
  validateManifest,
  BASELINE_POLICIES,
  composesAccordingTo,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
  UNDO_TOAST_AMBIENT_SATISFIER,
  type AmbientPolicySatisfier,
} from '@atelier/policies';
import type { IntentProfile, Manifest } from '@atelier/schemas';
import { DEMO_GITHUB_BRAND_KIT } from './brand-kit.js';
import { CAPABILITIES } from './capabilities.js';
import { DEMO_GITHUB_BINDINGS } from './component-bindings.js';
import { FIXTURE_ISSUES, FIXTURE_REPOS } from './github-fixtures.js';
import { loadGitHubToken, loadIntentProfile, DEMO_USER_ID, DEMO_APP_ID } from './intent-store.js';

type CirServices = Parameters<typeof CirRuntime>[0]['services'];

/**
 * POST to `/api/action/<id>`. Returns the parsed result envelope.
 */
async function postAction(capabilityId: string, input: unknown): Promise<unknown> {
  const res = await fetch(`/api/action/${capabilityId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input ?? {}),
  });
  const body = (await res.json()) as { ok?: boolean; result?: unknown; error?: string };
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `action ${capabilityId} failed (HTTP ${String(res.status)})`);
  }
  return body.result;
}

/**
 * Browser-side fixture surface. `MockDataResolver` honours filter / sort
 * client-side so the manifest's data binding works against fixtures
 * without round-tripping through the proxy. This is the boot-without-
 * a-token path.
 */
const fixtureResolver = new MockDataResolver({
  fixtures: {
    'github.repo.list': { repos: FIXTURE_REPOS },
    'github.issue.list': { issues: FIXTURE_ISSUES },
    'github.issue.get': { issue: FIXTURE_ISSUES[0] },
  },
});

/**
 * Live REST resolver. Used when a token is set; the resolver hits the
 * `/api/data/*` proxy so the GitHub token never reaches the browser
 * directly. The proxy injects `Authorization: token <token>` on the
 * server-side path and forwards the parsed JSON.
 */
const proxyResolver = new RestDataResolver({
  baseUrl: '/api/data',
  // The proxy returns JSON in the same shape MockDataResolver does.
});

/**
 * Composite resolver. We pick the fixture path in two cases:
 *   1. SSR (no `window`) — fixtures are deterministic and don't burn
 *      rate-limit headroom during build.
 *   2. No token configured — production behaviour for the unauthenticated
 *      tour.
 *
 * The runtime calls these resolvers per binding, so a host with a token
 * gets live data immediately on the next request after pasting it into
 * Settings.
 */
const composite = new CompositeDataResolver([fixtureResolver.resolve, proxyResolver.resolve], {
  predicates: [
    // Use fixtures in the unauthenticated tour AND on SSR.
    () => typeof window === 'undefined' || loadGitHubToken() === null,
    () => true,
  ],
});
const dataResolver = composite.resolve;

interface BuiltServices {
  services: CirServices;
  audit: StreamingAuditSink;
}

/**
 * Ambient runtime services this app mounts that satisfy named policy
 * obligations (Phase 2 #5 / `docs/ethos.md` principle #4):
 *
 *   - The header `<StatusBar>` (composed in the manifest as a sibling of
 *     `<Logo>` + `<NavBar>`) is bound to `github.api.rate_limit` and lives
 *     on every route — `RATE_LIMIT_CHIP_AMBIENT_SATISFIER` clears
 *     `rate_limited_actions_show_state` for every rate-limited capability.
 *   - The manifest layouts include an in-tree `<UndoToast>`. The baseline
 *     `<Queue>` primitive emits an inline feedback flash on dispatch;
 *     reversibility for optimistic archive is covered by the ambient
 *     `<UndoToast>` declared here.
 *
 * Marketplace pivot complete: Octant ships zero custom bindings (joining
 * Aurora). The five retired customs (`OctantHeader`, `Wordmark`,
 * `RateLimitStatusBar`, `RepoTable`, `IssueQueue`) are gone — manifests
 * compose baseline primitives directly.
 */
const AMBIENT_POLICY_SATISFIERS: readonly AmbientPolicySatisfier[] = [
  UNDO_TOAST_AMBIENT_SATISFIER,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
];

function buildServices(confirm: ConfirmationCallback): BuiltServices {
  // Baseline catalog only — Octant joins Aurora at zero custom bindings.
  // `DEMO_GITHUB_BINDINGS` is empty post-marketplace-pivot; the spread is
  // kept symmetrical so a future custom (only when a domain shape genuinely
  // earns one) drops in without restructuring the registry build.
  const registry = new MapComponentRegistry({
    ...COMPONENT_BINDINGS,
    ...DEMO_GITHUB_BINDINGS,
  });

  // Composition roles surfaced through `PolicyContext.composition_roles`.
  // With zero customs the resulting map is empty (no-op) — kept here so
  // future role-tagged customs flow through without policy plumbing
  // changes.
  const compositionRoles = compositionRolesFromBindings(DEMO_GITHUB_BINDINGS);
  // Action slots map for the `actions_match_action_slots` baseline policy.
  // Includes both baseline (Button, etc.) + demo-specific bindings so the
  // policy can flag manifests that declare more capabilities than the
  // binding has slots for.
  const actionSlots = actionSlotsFromBindings({
    ...COMPONENT_BINDINGS,
    ...DEMO_GITHUB_BINDINGS,
  });

  const actions = new MapActionRegistry();
  const wireAction =
    (capabilityId: string) =>
    async (input: unknown, _ctx: ActionExecutionContext): Promise<unknown> => {
      return postAction(capabilityId, input);
    };
  actions.register('github.issue.create', wireAction('github.issue.create'));
  actions.register('github.issue.close', wireAction('github.issue.close'));
  // archive is a client-only state flip — record an audit event but skip the network.
  actions.register('github.issue.archive', async (input, _ctx) => {
    return { archived_at: new Date().toISOString(), input };
  });
  // bulk_close fans out to issue.close in the route handler; the dispatcher
  // sends the verbal_required confirmation envelope and we POST.
  actions.register('github.issue.bulk_close', wireAction('github.issue.bulk_close'));

  // Audit sink lives client-side. The fetch wrapper bridges server
  // compile metadata (compiler model, tokens, duration) into the local
  // sink so `<CompileBadge>` surfaces it. Without this bridge the badge
  // would only see client-side `manifest.served` events.
  const audit = new StreamingAuditSink({ bufferSize: 200, echoToConsole: true });
  const auditFetch: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    if (res.ok) {
      const compilerId = res.headers.get('x-cir-compiler');
      const tokens = Number(res.headers.get('x-cir-tokens') ?? '0');
      const durationMs = Number(res.headers.get('x-cir-duration-ms') ?? '0');
      const source = res.headers.get('x-cir-source');
      const manifestId = res.headers.get('etag')?.replace(/"/g, '');
      if (compilerId) {
        const isServed = source === 'tier_3_cache';
        audit.emit({
          event_id: `evt_client_${Date.now().toString(36)}`,
          timestamp: new Date().toISOString(),
          user_id: 'demo-github-user',
          app_id: 'cir.demo-github',
          type: isServed ? 'manifest.served' : 'manifest.compiled',
          actor: 'system',
          before_state_hash: '',
          after_state_hash: '',
          trigger_chain: [],
          token_cost: tokens,
          policy_evaluations: [],
          ...(manifestId ? { manifest_id: manifestId } : {}),
          ...(compilerId ? { compiler_model: compilerId } : {}),
          ...(durationMs > 0 ? { duration_ms: durationMs } : {}),
        });
      }
    }
    return res;
  };
  const fetcher = new ManifestFetcher({ baseUrl: '/api', fetch: auditFetch });
  const cache = new MemoryManifestCache();

  const resolver = new ManifestResolver({
    fetcher,
    cache,
    validate: (manifest: Manifest) => {
      const result = validateManifest(
        {
          manifest,
          capabilities: CAPABILITIES,
          intent: {
            user_id: DEMO_USER_ID,
            global_preferences: {},
            granted_fields: [
              'github.issue.list.*',
              'github.issue.get.*',
              'github.issue.events.*',
              'github.issue.summary.*',
              'github.repo.list.*',
              'github.api.rate_limit.*',
            ],
          },
          rate_limited_capability_ids: new Set([
            'github.issue.create',
            'github.issue.close',
            'github.issue.bulk_close',
          ]),
          pii_fields: new Set(),
          brand_kit: DEMO_GITHUB_BRAND_KIT,
          composition_roles: compositionRoles,
          // Ambient satisfiers — the manifest's `<StatusBar>` rate-limit
          // chip (composed under the chrome stack) + the ambient undo
          // toast. Lets the policy validator clear obligations the
          // rendered chrome already covers, removing the need for
          // in-manifest hidden anchor nodes.
          ambient_policy_satisfiers: AMBIENT_POLICY_SATISFIERS,
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
      identity: { user_id: DEMO_USER_ID, app_id: DEMO_APP_ID },
      intent,
      // NOTE: `AMBIENT_POLICY_SATISFIERS` is NOT carried on the services bag.
      // The runtime contract (Phase 2 #5) is that the host hands satisfiers to
      // the policy validator directly via the `validate` hook input above
      // (`ambient_policy_satisfiers` on `PolicyContext`). The services bag
      // stays narrow per `docs/ethos.md` principle #4 (constrained surface).
    },
    audit,
  };
}

export function CirProviders({ children }: { children: ReactNode }): React.JSX.Element {
  const { confirm, Portal } = useReactConfirmation();
  const built = useMemo(() => buildServices(confirm), [confirm]);
  const { services, audit } = built;

  // Optional: SSE trigger transport. The demo-github exposes the same
  // `/api/triggers/stream` endpoint pattern, but it's not wired by
  // default — invalidation comes from the cache TTL + manual user action.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    return () => {
      // No-op cleanup; matched against future SSE wiring.
    };
  }, [services]);

  const isDev = typeof process !== 'undefined' && process.env['NODE_ENV'] !== 'production';

  return (
    <>
      <CirRuntime services={services} dataResolver={dataResolver}>
        {children}
      </CirRuntime>
      <Portal />
      {isDev ? <DebugPanel sink={audit} /> : null}
      {isDev ? (
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
      ) : null}
    </>
  );
}
