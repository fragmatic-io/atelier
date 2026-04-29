# @cir/runtime

The **framework-agnostic core** of CIR's render runtime. Phase 4a. Adapters
(React, native, voice) bind to this core; component implementations live in
`@cir/components`. Both land in Phase 4b.

The runtime is the only client-side surface a host app embeds. It is
deliberately "dumb" (ETHOS principle 7) — it binds data, dispatches actions,
and invalidates cache; it does NOT decide what to show. Decisions live in
manifests, manifests live in cache, cache invalidates on triggers.

## What's in here

- **Manifest cache** (`MemoryManifestCache`, `IndexedDBManifestCache`) — Tier
  4/5 of the cache hierarchy from [`docs/caching.md`](../../docs/caching.md).
  Async, key-based, LRU-evicting on `last_used`.
- **`ManifestFetcher`** — HTTP client for the Manifest Store with retry +
  AbortSignal + ETag.
- **`ManifestResolver`** — cache-first lookup; on miss, fetches, validates,
  stores, and emits `manifest.compiled`. Cache hit emits `manifest.served`.
  Validation failures throw `ManifestValidationError` and are NOT cached.
- **`ActionDispatcher`** — validates capability, gates on `modal` /
  `verbal_required` confirmation, executes the registered handler, pushes a
  reversible action onto the bounded LRU undo stack, emits `action.executed`
  / `action.denied`.
- **`InMemoryTriggerBus`** + `wireTriggerInvalidation()` — local trigger bus
  and the wiring that translates schema/policy/intent triggers into cache
  evictions per [`docs/caching.md`](../../docs/caching.md) §"What invalidates
  what". Real network transports (WebSocket / SSE) are per-deployment.
- **Component / action registries** — interfaces + Map-backed defaults. The
  component registry's `factory` is opaque; the framework adapter (Phase 4b)
  decides what shape it carries.
- **`buildRenderPlan(manifest, route, registry)`** — pure transform from a
  `Manifest` route into a framework-agnostic `RenderPlan` node tree.
- **`AuditSink`** — pluggable destination for `AuditEvent`s.
  `NoopAuditSink` for prod default; `ConsoleAuditSink` for dev.

## How an adapter consumes this (sketch)

```ts
import {
  ManifestFetcher,
  ManifestResolver,
  MemoryManifestCache,
  ActionDispatcher,
  MapActionRegistry,
  MapComponentRegistry,
  buildRenderPlan,
  InMemoryTriggerBus,
  wireTriggerInvalidation,
} from '@cir/runtime';

const fetcher = new ManifestFetcher({ baseUrl: 'https://manifest.example' });
const cache = new MemoryManifestCache();
const resolver = new ManifestResolver({ fetcher, cache });
const bus = new InMemoryTriggerBus();
wireTriggerInvalidation({ bus, cache });

const registry = new MapComponentRegistry({
  Stack: { id: 'Stack', factory: ReactStack },
  // ...
});
const actions = new MapActionRegistry();
actions.register('thread.archive', threadArchiveHandler);

const dispatcher = new ActionDispatcher({
  capabilities,
  registry: actions,
  confirm: askUserViaModal,
});

const manifest = await resolver.resolve({ user_id, app_id, route: '/today' });
const plan = buildRenderPlan(manifest, '/today', registry);
// adapter renders `plan.root` recursively, wiring `node.actions` to dispatcher.
```

## Background

- [`docs/architecture.md`](../../docs/architecture.md) — system overview, hot
  path, cold path, service contracts, audit log.
- [`docs/caching.md`](../../docs/caching.md) — five-tier cache, cache keys,
  trigger -> invalidation matrix, local cache strategy.
- [`docs/triggers.md`](../../docs/triggers.md) — trigger taxonomy this
  runtime subscribes to.

## Status / what's deferred

Phase 4a ships the framework-agnostic core. **Out of scope here:**

- React (or any UI framework) adapter — Phase 4b.
- Component implementations (Stack, Card, Button, ...) — Phase 4b in
  `@cir/components`.
- Real WebSocket / SSE / long-poll transport for the trigger bus — per
  deployment, Phase 4c.
- Byte-size accounting for IndexedDB cache (50MB soft / 200MB hard caps from
  [`docs/caching.md`](../../docs/caching.md)). Phase 4a uses count-based LRU
  (`maxEntries`, default 200) — Phase 4c will add bytes.
- Stale-while-revalidate, optimistic UI, live-query subscriptions — Phase
  4b/4c.

## Testing helpers

`@cir/runtime/testing` exports `MemoryManifestCache`, `InMemoryTriggerBus`,
`Map*Registry`, `ALWAYS_CONFIRM` / `ALWAYS_DECLINE`, and `ConsoleAuditSink`
for downstream test suites.
