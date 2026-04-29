// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `@cir/runtime` — public surface of the framework-agnostic runtime core.
 *
 * What lives here (Phase 4a):
 *  - Manifest cache interface + Memory and IndexedDB implementations
 *  - Manifest fetcher (HTTP) and resolver (cache-first, validate, audit)
 *  - Component and action registries (interfaces + Map-backed defaults)
 *  - Action dispatcher with confirmation gating + bounded LRU undo
 *  - Trigger subscription contract + in-memory bus + cache-invalidation wiring
 *  - Render-plan derivation: `buildRenderPlan(manifest, route, registry)`
 *  - Audit sink contract + Noop and Console implementations
 *
 * What does NOT live here (deferred):
 *  - Framework adapters (React etc.): Phase 4b
 *  - Component implementations (Stack, Card, Button, ...): Phase 4b
 *  - Real WebSocket/SSE/long-poll trigger transports: Phase 4c
 *
 * The `./testing` subpath exports test helpers (in-memory bus, confirm
 * sentinels, etc.) and is NOT re-exported here intentionally.
 *
 * See `/Users/vid/cir/docs/architecture.md` and `/Users/vid/cir/docs/caching.md`
 * for the architectural background each module mirrors.
 */

// -----------------------------------------------------------------------------
// Manifest cache
// -----------------------------------------------------------------------------
export type { CachedManifest, ManifestCache, ManifestCacheKey } from './manifest/cache.js';
export { deserializeCacheKey, serializeCacheKey } from './manifest/cache.js';
export { MemoryManifestCache } from './manifest/memory-cache.js';
export {
  IndexedDBManifestCache,
  type IndexedDBManifestCacheOptions,
} from './manifest/indexeddb-cache.js';

// -----------------------------------------------------------------------------
// Manifest fetcher + resolver
// -----------------------------------------------------------------------------
export {
  ManifestFetcher,
  ManifestFetchError,
  type FetchedManifest,
  type ManifestFetcherOptions,
} from './manifest/fetcher.js';
export {
  ManifestResolver,
  ManifestValidationError,
  type ManifestResolverOptions,
  type ManifestValidationFail,
  type ManifestValidationOk,
  type ManifestValidationResult,
  type ResolveOptions,
} from './manifest/resolver.js';

// -----------------------------------------------------------------------------
// Actions (dispatcher, confirmation, undo)
// -----------------------------------------------------------------------------
export {
  ActionDispatcher,
  type ActionDispatcherOptions,
  type ActionExecutionContext,
  type ActionResult,
} from './actions/dispatcher.js';
export {
  ALWAYS_CONFIRM,
  ALWAYS_DECLINE,
  requiresConfirmation,
  type ConfirmationCallback,
  type ConfirmationDecision,
  type ConfirmationRequest,
} from './actions/confirm.js';
export { UndoStack, type UndoEntry } from './actions/undo.js';

// -----------------------------------------------------------------------------
// Triggers (subscription, in-memory bus, cache invalidation)
// -----------------------------------------------------------------------------
export {
  WILDCARD_TRIGGER_TYPE,
  type TriggerHandler,
  type TriggerSubscription,
} from './triggers/subscription.js';
export { InMemoryTriggerBus, type InMemoryTriggerBusOptions } from './triggers/memory-bus.js';
export {
  wireTriggerInvalidation,
  type WireTriggerInvalidationOptions,
} from './triggers/invalidation.js';
export {
  SseTriggerTransport,
  type SseTriggerTransportOptions,
  type EventSourceLike,
  type EventSourceCtor,
} from './triggers/sse-transport.js';

// -----------------------------------------------------------------------------
// Registries
// -----------------------------------------------------------------------------
export {
  EMPTY_REGISTRY,
  MapComponentRegistry,
  type ComponentBinding,
  type ComponentRegistry,
} from './registry/component-registry.js';
export {
  MapActionRegistry,
  type ActionHandler,
  type ActionRegistry,
} from './registry/action-registry.js';

// -----------------------------------------------------------------------------
// Render plan
// -----------------------------------------------------------------------------
export { buildRenderPlan, RouteNotFoundError, RouteNotRenderableError } from './render/plan.js';
export type { RenderNode, RenderPlan } from './render/plan-types.js';

// -----------------------------------------------------------------------------
// Audit
// -----------------------------------------------------------------------------
export { ConsoleAuditSink, NoopAuditSink, type AuditSink } from './audit/emit.js';
export {
  StreamingAuditSink,
  type AuditListener,
  type StreamingAuditSinkOptions,
} from './audit/streaming.js';
