// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * The CIR runtime services bag for the demo, plus the React provider tree.
 *
 * What's wired:
 *  - Component registry: @cir/components baseline + apps/demo/components
 *    (DecisionQueue, TaskQueue) merged into one MapComponentRegistry
 *  - Action registry: handlers POST to /api/action/{capability}
 *  - Manifest fetcher: GET /api/manifest/{user}/{app}/{route}
 *  - Memory cache (browser-side; IndexedDB is overkill for the demo)
 *  - Resolver with policy validation via @cir/policies BASELINE_POLICIES
 *  - In-memory trigger bus + cache invalidation wiring
 *  - Console audit sink (open devtools to see events)
 *  - DataResolver: GET /api/data/{capability}?filter=...&group_by=...
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
  SseTriggerTransport,
  StreamingAuditSink,
  wireTriggerInvalidation,
  withUndo,
  type ActionExecutionContext,
  type ConfirmationCallback,
} from '@cir/runtime';
import {
  COMPONENT_BINDINGS,
  COMPOSITION_RULES,
  IconResolverProvider,
  KeyboardProvider,
  LucideIconResolver,
} from '@cir/components';
import {
  InMemoryKeyboardRegistry,
  InMemoryRecencyTracker,
  type KeyboardServices,
} from '@cir/keyboard';
import {
  CirRuntime,
  CompileBadge,
  DebugPanel,
  createUndoToastEmitter,
  useReactConfirmation,
  type DataBinding,
} from '@cir/react';
import { CompositeDataResolver, MockDataResolver, RestDataResolver } from '@cir/data-resolvers';
import {
  validateManifest,
  BASELINE_POLICIES,
  composesAccordingTo,
  UNDO_TOAST_AMBIENT_SATISFIER,
} from '@cir/policies';
import type { IntentProfile, Manifest } from '@cir/schemas';
import { DEMO_BRAND_KIT } from './brand-kit';
import { CAPABILITIES } from './fake-capabilities';
import { loadIntentProfile } from './intent-store';
import { AmbientCommandPalette, AmbientUndoBar, DEMO_BINDINGS } from '@/components';

type CirServices = Parameters<typeof CirRuntime>[0]['services'];

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
 * The demo proxies most data through `/api/data/{capability}` — the server
 * holds the demo's fake store. New capabilities introduced in Wave 6 P-2
 * (`github.repo.list`, `dummyjson.product.list`, `dummyjson.product.search`)
 * skip that proxy: GitHub data is fixture-only (mock), dummyjson is a real
 * public API the demo can hit directly. We compose the two new resolvers
 * with the legacy proxy so existing thread.* / task.* bindings keep working.
 */
const proxyDataResolver = async (binding: DataBinding): Promise<unknown> => {
  const params = new URLSearchParams();
  if (binding.filter) params.set('filter', binding.filter);
  if (binding.sort) params.set('sort', binding.sort);
  if (binding.group_by) params.set('group_by', binding.group_by);
  const qs = params.toString();
  const url = `/api/data/${binding.source}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`data fetch failed: HTTP ${String(res.status)} for ${binding.source}`);
  }
  return res.json();
};

const githubRepoFixtures = [
  {
    id: 1,
    name: 'cir',
    full_name: 'fragmatic-io/cir',
    private: false,
    html_url: 'https://github.com/fragmatic-io/cir',
    description: 'Capability · Intent · Render — production architecture for dynamic UI',
    stargazers_count: 128,
    open_issues_count: 6,
    updated_at: '2026-04-30T12:00:00Z',
  },
  {
    id: 2,
    name: 'demo',
    full_name: 'fragmatic-io/demo',
    private: false,
    html_url: 'https://github.com/fragmatic-io/demo',
    description: 'CIR demo app',
    stargazers_count: 12,
    open_issues_count: 1,
    updated_at: '2026-04-29T09:00:00Z',
  },
];

const mockResolver = new MockDataResolver({
  fixtures: { 'github.repo.list': { repos: githubRepoFixtures } },
});

const dummyjsonResolver = new RestDataResolver({
  urlMap: {
    'dummyjson.product.list': 'https://dummyjson.com/products',
    'dummyjson.product.search': 'https://dummyjson.com/products/search',
  },
});

const composite = new CompositeDataResolver(
  [mockResolver.resolve, dummyjsonResolver.resolve, proxyDataResolver],
  {
    predicates: [
      (b) => b.source === 'github.repo.list',
      (b) => b.source.startsWith('dummyjson.'),
      () => true,
    ],
  },
);

const dataResolver = composite.resolve;

/**
 * Wave 11 / Vis-3 — host-wired icon pack. Aurora's `iconography.allowed_sets`
 * lists `'lucide'`, so the demo wires `LucideIconResolver` once at module
 * eval and threads it through `<IconResolverProvider>`. Components like
 * `<Button icon="archive">` resolve the name against this resolver; anything
 * outside the curated roster falls back to a layout-stable placeholder + a
 * one-time console warn.
 */
const iconResolver = new LucideIconResolver({
  allowedSets: DEMO_BRAND_KIT.iconography?.allowed_sets,
});

/**
 * Wave 11 / Int-3 — keyboard registry seeded with one `KeyboardAction` per
 * action-kind capability the demo grants. Every capability becomes a
 * Cmd+K-discoverable action; the palette + chord shortcuts (future Int-7)
 * are layered on top of this same registry.
 *
 * The registry is built once at module eval (not per render) so the
 * subscription identities stay stable across React strict-mode double
 * renders. The `<KeyboardProvider>` further down surfaces it on context.
 *
 * Action labels and icons are intentionally human-friendly — the palette
 * renders these directly. Hotkeys are deliberately omitted here (the
 * `palette.open` action self-binds Cmd+K via `<AmbientCommandPalette>`);
 * Int-7 is when chord shortcuts (`g i`, `e` to archive) land.
 */
function buildKeyboardServices(): KeyboardServices {
  const registry = new InMemoryKeyboardRegistry();
  const ACTION_META: ReadonlyArray<{
    id: string;
    label: string;
    description?: string;
    icon?: string;
    group: string;
  }> = [
    {
      id: 'thread.archive',
      label: 'Archive thread',
      description: 'Move the active thread out of the inbox',
      icon: 'archive',
      group: 'Inbox',
    },
    {
      id: 'thread.unarchive',
      label: 'Unarchive thread',
      icon: 'inbox',
      group: 'Inbox',
    },
    {
      id: 'task.complete',
      label: 'Complete task',
      icon: 'check',
      group: 'Tasks',
    },
    {
      id: 'task.reopen',
      label: 'Reopen task',
      icon: 'circle-dot',
      group: 'Tasks',
    },
    {
      id: 'task.snooze',
      label: 'Snooze task',
      icon: 'clock',
      group: 'Tasks',
    },
    {
      id: 'task.unsnooze',
      label: 'Unsnooze task',
      icon: 'bell',
      group: 'Tasks',
    },
    {
      id: 'task.create_from_thread',
      label: 'Create task from thread',
      icon: 'plus',
      group: 'Tasks',
    },
    {
      id: 'task.delete',
      label: 'Delete task',
      icon: 'trash-2',
      group: 'Tasks',
    },
  ];
  for (const meta of ACTION_META) {
    registry.register({
      id: meta.id,
      label: meta.label,
      ...(meta.description !== undefined ? { description: meta.description } : {}),
      ...(meta.icon !== undefined ? { icon: meta.icon } : {}),
      group: meta.group,
      scope: 'global',
      // The palette + provider wire the actual dispatcher invocation. For
      // discovery seeding, the invoke is a no-op that logs — the demo's
      // route-mounted UI is what fires real dispatches today.
      invoke: () => {
        console.info(`[cir] keyboard: ${meta.id} invoked from palette`);
      },
    });
  }
  return {
    registry,
    recency: new InMemoryRecencyTracker(),
  };
}

const keyboardServices: KeyboardServices = buildKeyboardServices();

interface BuiltServices {
  services: CirServices;
  audit: StreamingAuditSink;
  /**
   * The `<Sink>` for the Wave 11 / Int-8 undo-toast emitter. Mounted next
   * to `<Portal />` in `CirProviders` so the wrapped dispatcher's notices
   * land on a `<Toast variant="undo">` instance per dispatch.
   */
  UndoSink: React.FC;
}

function buildServices(confirm: ConfirmationCallback): BuiltServices {
  // Component registry: combine @cir/components baseline + demo extensions
  const registry = new MapComponentRegistry({
    ...COMPONENT_BINDINGS,
    ...DEMO_BINDINGS,
  });

  // Action registry: every handler hits the fake API.
  const actions = new MapActionRegistry();
  const wireAction =
    (capabilityId: string) =>
    async (input: unknown, _ctx: ActionExecutionContext): Promise<unknown> => {
      return postAction(capabilityId, input);
    };
  actions.register('thread.archive', wireAction('thread.archive'));
  actions.register('thread.unarchive', wireAction('thread.unarchive'));
  actions.register('task.complete', wireAction('task.complete'));
  actions.register('task.reopen', wireAction('task.reopen'));
  actions.register('task.snooze', wireAction('task.snooze'));
  actions.register('task.unsnooze', wireAction('task.unsnooze'));
  actions.register('task.create_from_thread', wireAction('task.create_from_thread'));
  actions.register('task.delete', wireAction('task.delete'));

  // Manifest fetcher → /api/manifest. Resolver validates via policy engine.
  const fetcher = new ManifestFetcher({ baseUrl: '/api' });
  const cache = new MemoryManifestCache();
  // StreamingAuditSink: feeds the DebugPanel + CompileBadge.
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
            global_preferences: {},
            granted_fields: [
              'thread.list.*',
              'task.list.*',
              'thread.id',
              'thread.sender',
              'thread.subject',
              'thread.snippet',
              'thread.received_at',
              'thread.requires_decision',
            ],
          },
          rate_limited_capability_ids: new Set(),
          pii_fields: new Set(['email']),
          brand_kit: DEMO_BRAND_KIT,
          // Marketplace pivot: `<UndoBar>` is no longer a manifest node —
          // we mount it ambiently below. Declaring the satisfier here
          // tells `reversibility_surfaced` the obligation is covered for
          // every reversible action this runtime fires.
          ambient_policy_satisfiers: [UNDO_TOAST_AMBIENT_SATISFIER],
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

  const innerDispatcher = new ActionDispatcher({
    capabilities: CAPABILITIES,
    registry: actions,
    confirm,
    audit,
  });

  // Wave 11 / Int-8 — undo-toast emitter wired to the inner dispatcher.
  // The emitter is bound to the inner so `dispatcher.undoFromToken()` finds
  // the open token (the wrapped dispatcher proxies through, but binding
  // directly to the inner skips one hop). The `<Sink>` mounts in
  // `CirProviders` next to `<Portal />`.
  const { emitter: undoEmitter, Sink: UndoSink } = createUndoToastEmitter(innerDispatcher);

  // The dispatcher Aurora exposes through `useCir()` is the wrapped one:
  // every successful undoable dispatch fans a notice out to the emitter.
  // The legacy ambient `<UndoBar>` continues to work — it consumes the
  // dispatcher's undo stack (`canUndo()` / `undo()`), independent of the
  // toast path. Hosts can keep both during the cutover.
  const dispatcher = withUndo({
    inner: innerDispatcher,
    capabilities: CAPABILITIES,
    emitter: undoEmitter,
  });

  // Wave 6 / P-1: thread the persisted intent profile into the services bag
  // so the renderer (`<RenderNode>` walker) can default personalisation props
  // like `density` from `intent.global_preferences`. Falls back to undefined
  // when no profile exists yet (first-time user); the renderer handles that.
  const intent: IntentProfile | undefined = loadIntentProfile() ?? undefined;

  return {
    services: {
      resolver,
      dispatcher,
      registry,
      bus,
      audit,
      identity: { user_id: 'demo-user', app_id: 'cir.demo' },
      intent,
      // Track DS-A: Aurora brand kit threaded through the services bag so the
      // compiler service / policy engine read it directly rather than refetching
      // `/.well-known/brand-kit.json` on every compile.
      brandKit: DEMO_BRAND_KIT,
    },
    audit,
    UndoSink,
  };
}

export function CirProviders({ children }: { children: ReactNode }): React.JSX.Element {
  const { confirm, Portal } = useReactConfirmation();
  // Memoize so React strict mode and re-renders don't rebuild the cache.
  const built = useMemo(() => buildServices(confirm), [confirm]);
  const { services, audit, UndoSink } = built;

  // Connect the SSE transport on mount; tear down on unmount. The transport
  // bridges /api/triggers/stream events into the local bus, which the cache
  // invalidation wiring listens to.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const transport = new SseTriggerTransport({
      url: '/api/triggers/stream',
      bus: services.bus,
      onError: (err) => {
        // EventSource auto-reconnects; this fires on transient drops.
        console.warn('[cir] trigger stream error', err);
      },
      onParseError: (raw, err) => {
        console.warn('[cir] dropped malformed trigger payload', raw, err);
      },
    });
    transport.connect();
    return () => {
      transport.close();
    };
  }, [services]);

  return (
    <>
      {/*
        Wave 11 / Vis-3 — `<IconResolverProvider>` wraps the runtime so every
        manifest-rendered `<Icon>` (including those inside `<Button icon>`,
        `<Alert icon>`, `<EmptyState icon>`, `<MetaBadge icon>`) resolves
        against the host's `LucideIconResolver`. Aurora's brand kit pins
        `iconography.allowed_sets: ['lucide']`; the resolver enforces that
        at runtime.
      */}
      <IconResolverProvider resolver={iconResolver}>
        {/*
          Wave 11 / Int-3 — `<KeyboardProvider>` wraps the runtime so every
          subtree can read `KeyboardServices` from context. Hosts wire one
          provider; downstream `useKeyboardAction()` calls register against
          its registry. The palette below auto-discovers from this same
          registry; Cmd+K opens it from anywhere on the page.
        */}
        <KeyboardProvider services={keyboardServices}>
          <CirRuntime services={services} dataResolver={dataResolver}>
            {children}
            {/*
              Wave 11 / Int-8 — ambient undo-toast sink. The wrapped
              dispatcher's `withUndo()` middleware fans every successful
              undoable dispatch into `<Toast variant="undo">` instances
              mounted here. This is the new primary undo affordance —
              Linear-style 5-second window with a countdown bar.
            */}
            <UndoSink />
            {/*
              Ambient undo bar — mounted INSIDE <CirRuntime> so it can read the
              dispatcher via `useCir()`, but OUTSIDE the manifest tree so it's
              not a manifest-referenced custom binding. Kept as a fallback
              affordance for stack-based undo (`dispatcher.undo()` /
              `canUndo()` — covers actions that committed before the toast
              was dismissed). The `UNDO_TOAST_AMBIENT_SATISFIER` declaration
              on the policy context covers the obligation either way.
            */}
            <AmbientUndoBar />
            {/*
              Wave 11 / Int-3 — ambient command palette. Mounted OUTSIDE the
              manifest tree (like `<AmbientUndoBar>`); auto-discovers
              commands from the `KeyboardProvider` registry seeded above.
              Cmd+K opens it from anywhere; Esc closes.
            */}
            <AmbientCommandPalette />
          </CirRuntime>
        </KeyboardProvider>
      </IconResolverProvider>
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
