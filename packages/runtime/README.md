# @cir/runtime

The **render SDK**. Fetches manifests, binds component implementations, executes data queries, dispatches actions through the Action Gateway, and manages the local manifest cache. Web first; native and voice land in later phases.

## Scope

The runtime is the only client-side surface a host app embeds. It owns:

- Manifest fetcher and local cache (IndexedDB on web; native KV / context on other targets).
- Component registry binding — maps the names in a manifest to their implementations.
- Data binding and live queries.
- Action dispatcher with confirmation policy enforcement, optimistic UI, undo.
- Trigger subscription and cache invalidation.

It does **not** call the compiler directly, hold user intent, or render anything outside the manifest contract. See the system overview in [`../../docs/architecture.md`](../../docs/architecture.md) and the chat/voice render targets in [`../../docs/chat/render-targets.md`](../../docs/chat/render-targets.md).

## Background

See [`../../docs/architecture.md`](../../docs/architecture.md) — sections "System overview", "Data flow: the hot path (render)", and "Service contracts" for the runtime's exact responsibilities and the manifest fetch protocol.

## Files

Standard TypeScript package layout (`src/`, `dist/`, `package.json`). The web entry point is the priority target; native (React Native / SwiftUI bridge) and voice (text_render fallback driver) come later.

## Status

Stub package in Phase 2 (workspace plumbing only). Source lands starting in **Phase 5 (hello-CIR loop)**, which calls for a working web SDK as part of the email vertical slice.
