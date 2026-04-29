// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * `buildTestServices()` — assembles a `CirRuntimeServices` bag wired to
 * in-memory testing helpers from `@cir/runtime/testing`.
 *
 * Hosts can override any individual service. Identity defaults to
 * `('test-user', 'test-app')`. The dispatcher is wired with `ALWAYS_CONFIRM`
 * so tests don't have to deal with the modal portal unless they want to.
 */

import {
  ActionDispatcher,
  ManifestFetcher,
  ManifestResolver,
  type ConfirmationCallback,
} from '@cir/runtime';
import {
  ALWAYS_CONFIRM,
  InMemoryTriggerBus,
  MapActionRegistry,
  MapComponentRegistry,
  MemoryManifestCache,
} from '@cir/runtime/testing';
import type { Capability, Manifest } from '@cir/schemas';
import type { CirRuntimeServices } from '../context/runtime-context.js';

export interface BuildTestServicesOptions {
  identity?: { user_id: string; app_id: string };
  capabilities?: Record<string, Capability>;
  /** Manifests keyed by route — the fetcher returns from this map. */
  manifestsByRoute?: Record<string, Manifest>;
  componentRegistry?: MapComponentRegistry;
  confirm?: ConfirmationCallback;
}

export function buildTestServices(opts: BuildTestServicesOptions = {}): CirRuntimeServices & {
  cache: MemoryManifestCache;
  bus: InMemoryTriggerBus;
  actions: MapActionRegistry;
  registry: MapComponentRegistry;
} {
  const identity = opts.identity ?? { user_id: 'test-user', app_id: 'test-app' };
  const cache = new MemoryManifestCache();
  const bus = new InMemoryTriggerBus();
  const actions = new MapActionRegistry();
  const registry = opts.componentRegistry ?? new MapComponentRegistry();

  const manifests = opts.manifestsByRoute ?? {};

  const urlOf = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    if (input instanceof Request) return input.url;
    return '';
  };
  const fakeFetch: typeof globalThis.fetch = (input) => {
    const url = urlOf(input);
    // Match `/manifest/{user}/{app}/{routeEncoded}`
    const m = /\/manifest\/[^/]+\/[^/]+\/(.+)$/.exec(url);
    const route = m ? decodeURIComponent(m[1] ?? '') : '';
    const manifest = manifests[route];
    if (!manifest) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };

  const fetcher = new ManifestFetcher({
    baseUrl: 'http://test.local',
    fetch: fakeFetch,
    retries: 0,
  });
  const resolver = new ManifestResolver({ fetcher, cache });

  const dispatcher = new ActionDispatcher({
    capabilities: opts.capabilities ?? {},
    registry: actions,
    confirm: opts.confirm ?? ALWAYS_CONFIRM,
  });

  return {
    identity,
    resolver,
    dispatcher,
    registry,
    bus,
    cache,
    actions,
  };
}
