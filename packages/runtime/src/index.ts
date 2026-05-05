// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/runtime` — public surface of the framework-agnostic runtime core.
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
  ManifestShapeError,
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
  DEFAULT_UNDO_WINDOW_MS,
  DispatchInputError,
  optimisticDispatch,
  UndoExpiredError,
  type ActionDispatcherOptions,
  type ActionExecutionContext,
  type ActionResult,
  type OptimisticDispatchOptions,
  type UndoResult,
  type UndoTimer,
} from './actions/dispatcher.js';
export {
  ALWAYS_CONFIRM,
  ALWAYS_DECLINE,
  requiresConfirmation,
  type ConfirmationCallback,
  type ConfirmationDecision,
  type ConfirmationRequest,
} from './actions/confirm.js';
export { UndoStack, type UndoEntry, type UndoExecutionContext } from './actions/undo.js';
export {
  withUndo,
  recordingEmitter,
  type UndoHandle,
  type UndoToastEmitter,
  type UndoToastNotice,
  type WithUndoOptions,
  type WrappedDispatcher,
} from './actions/with-undo.js';

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
  SseTriggerStreamBridge,
  type SseTriggerStreamBridgeOptions,
  type EventSourceLike as SseStreamBridgeEventSourceLike,
  type EventSourceCtor as SseStreamBridgeEventSourceCtor,
} from './triggers/sse-transport.js';
export type {
  TriggerEnvelope,
  TriggerTransport,
  TriggerTransportHandler,
  TriggerTransportUnsubscribe,
} from './triggers/trigger-transport.js';
export { InMemoryTriggerTransport } from './transports/in-memory-trigger-transport.js';
export {
  SseTriggerTransport,
  type SseTriggerTransportOptions,
  type EventSourceLike,
  type EventSourceCtor,
  type FetchLike,
} from './transports/sse-trigger-transport.js';
export {
  createTriggerCoordinator,
  type TriggerCoordinator,
  type TriggerCoordinatorOptions,
} from './transports/trigger-coordinator.js';
export {
  DEFAULT_REDIS_CHANNEL_PREFIX,
  REDIS_TRIGGER_ENVELOPE_VERSION,
  RedisTriggerBus,
  type RedisLikePublisher,
  type RedisLikeSubscriber,
  type RedisTriggerBusOptions,
  type RedisTriggerEnvelope,
} from './triggers/redis-bus.js';
export {
  DEFAULT_NATS_SUBJECT_PREFIX,
  NATS_TRIGGER_ENVELOPE_VERSION,
  NATSTriggerBus,
  type NATSLikeConnection,
  type NATSLikeMessage,
  type NATSLikeSubscription,
  type NATSTriggerBusOptions,
  type NATSTriggerEnvelope,
} from './triggers/nats-bus.js';

// -----------------------------------------------------------------------------
// Registries
// -----------------------------------------------------------------------------
export {
  actionSlotsFromBindings,
  compositionRolesFromBindings,
  manifestContractsFromBindings,
  EMPTY_REGISTRY,
  MapComponentRegistry,
  requiresExplicitStateSlotsFromBindings,
  type ComponentBinding,
  type ComponentRegistry,
  type CompositionRole,
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
// Data — filter helpers (Sprint 2.4 / P3)
// -----------------------------------------------------------------------------
export {
  applyFilter,
  formatFilterAsString,
  isStructuredFilter,
  type FilterValue,
} from './data/filter-utils.js';

// -----------------------------------------------------------------------------
// Motion (Wave 7 / P-7)
// -----------------------------------------------------------------------------
export {
  MOTION_DEFAULTS,
  REDUCED_MOTION_QUERY,
  durationFor,
  isReducedMotion,
  readMotionTokens,
  viewTransition,
  type MotionDurations,
  type MotionEasing,
  type MotionEasings,
  type MotionSpeed,
  type MotionTokens,
  type TransitionPhase,
} from './motion/index.js';

// -----------------------------------------------------------------------------
// Audit
// -----------------------------------------------------------------------------
export { ConsoleAuditSink, NoopAuditSink, type AuditSink } from './audit/emit.js';
export {
  StreamingAuditSink,
  type AuditListener,
  type StreamingAuditSinkOptions,
} from './audit/streaming.js';
export {
  BehavioralTap,
  auditEventToObservedAction,
  capabilityIdFromAuditEvent,
  type BehavioralTapOptions,
} from './audit/behavioral-tap.js';
