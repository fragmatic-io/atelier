// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * CIR runtime services bag for `apps/demo-github`. Mirrors the demo's
 * `cir-providers.tsx` with three demo-specific tweaks:
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
} from '@cir/runtime';
import { COMPONENT_BINDINGS, COMPOSITION_RULES } from '@cir/components';
import {
  CirRuntime,
  CompileBadge,
  DebugPanel,
  useReactConfirmation,
  type DataBinding,
} from '@cir/react';
import { CompositeDataResolver, MockDataResolver, RestDataResolver } from '@cir/data-resolvers';
import {
  validateManifest,
  BASELINE_POLICIES,
  composesAccordingTo,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
  UNDO_TOAST_AMBIENT_SATISFIER,
  type AmbientPolicySatisfier,
} from '@cir/policies';
import type { IntentProfile, Manifest } from '@cir/schemas';
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
 *   - `<OctantHeader>` renders the rate-limit chip on every route, polling
 *     the GitHub-client rate-limit snapshot — `<RateLimitStatusBar>`
 *     ambient → `rate_limited_actions_show_state`.
 *   - The manifest layouts include an in-tree `<UndoToast>` plus the
 *     `<IssueQueue>` raises its own optimistic-archive toast. Mount-time
 *     declaration here covers any reversible capability the dispatcher
 *     fires while the app is mounted.
 *
 * Declaring these here removes the need for the in-manifest
 * `rateLimitQuotaNode()` band-aid (the hidden `<StatCard>` we deleted in
 * `lib/manifests.ts`).
 */
const AMBIENT_POLICY_SATISFIERS: readonly AmbientPolicySatisfier[] = [
  UNDO_TOAST_AMBIENT_SATISFIER,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
];

function buildServices(confirm: ConfirmationCallback): BuiltServices {
  // Baseline catalog first; demo-specific bindings (IssueQueue, RepoTable,
  // OctantHeader, RateLimitStatusBar, Wordmark) are layered on top so the
  // manifest can reference any of them in `LayoutNode.component`.
  const registry = new MapComponentRegistry({
    ...COMPONENT_BINDINGS,
    ...DEMO_GITHUB_BINDINGS,
  });

  // Composition roles surfaced through `PolicyContext.composition_roles`
  // so the long-list-hierarchy and empty/loading/error policies treat
  // role-tagged custom bindings (e.g. `<IssueQueue compositionRole="list">`)
  // as equivalent to their baseline counterparts.
  const compositionRoles = compositionRolesFromBindings(DEMO_GITHUB_BINDINGS);

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

  const fetcher = new ManifestFetcher({ baseUrl: '/api' });
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
          // Ambient satisfiers — `<OctantHeader>` rate-limit chip + the
          // ambient undo toast. Lets the policy validator clear
          // obligations the rendered chrome already covers, removing the
          // need for in-manifest hidden anchor nodes.
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
      ambientPolicySatisfiers: AMBIENT_POLICY_SATISFIERS,
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
