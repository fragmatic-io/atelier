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
import { validateManifest, BASELINE_POLICIES, composesAccordingTo } from '@cir/policies';
import type { Manifest } from '@cir/schemas';
import { DEMO_BRAND_KIT } from './brand-kit';
import { CAPABILITIES } from './fake-capabilities';
import { DEMO_BINDINGS } from '@/components';

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

const dataResolver = async (binding: DataBinding): Promise<unknown> => {
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

interface BuiltServices {
  services: CirServices;
  audit: StreamingAuditSink;
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
  actions.register('task.complete', wireAction('task.complete'));
  actions.register('task.snooze', wireAction('task.snooze'));
  actions.register('task.create_from_thread', wireAction('task.create_from_thread'));

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

  return {
    services: {
      resolver,
      dispatcher,
      registry,
      bus,
      audit,
      identity: { user_id: 'demo-user', app_id: 'cir.demo' },
    },
    audit,
  };
}

export function CirProviders({ children }: { children: ReactNode }): React.JSX.Element {
  const { confirm, Portal } = useReactConfirmation();
  // Memoize so React strict mode and re-renders don't rebuild the cache.
  const built = useMemo(() => buildServices(confirm), [confirm]);
  const { services, audit } = built;

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
