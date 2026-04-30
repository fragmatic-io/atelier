# @cir/react

The React adapter for [`@cir/runtime`](../runtime/README.md).

This package is the bridge between CIR's framework-agnostic runtime core and
React. It provides:

- A **provider** (`<CirRuntime>`) that puts the runtime services on a React
  context.
- **Hooks** for resolving manifests, dispatching actions, subscribing to
  triggers, and wiring confirmation modals.
- A **`<CirRoute>` walker** that maps a `RenderPlan` into a JSX tree.
- A semantic `<dialog>`-based **confirmation portal** that satisfies the
  runtime's `ConfirmationCallback` contract.

The package does **not** ship UI components — those live in
[`@cir/components`](../components/README.md). The adapter receives the
`ComponentRegistry` as services and renders whatever bindings the host
provides. ETHOS principle 7: the render runtime is dumb on purpose.

## Next.js / React Server Components

Every file that uses hooks, context, or class state ships with the
`'use client'` directive. You can import `@cir/react` from a Server
Component without a wrapper — Next.js will route the boundary correctly:

```tsx
// app/today/page.tsx — Server Component
import { CirRuntime, CirRoute } from '@cir/react';
import { buildServices } from '@/lib/cir-services';

export default function TodayPage() {
  return (
    <CirRuntime services={buildServices()}>
      <CirRoute path="/today" />
    </CirRuntime>
  );
}
```

`@cir/components` is mostly server-component-friendly (pure functional
components with no state); only `ConfirmDialog` is client-only.
`@cir/runtime`, `@cir/policies`, and `@cir/schemas` are pure
TypeScript with no React dependencies — safe to import from anywhere.

## Quick start

```tsx
import { CirRuntime, CirRoute, useReactConfirmation } from '@cir/react';
import {
  ManifestFetcher,
  ManifestResolver,
  ActionDispatcher,
  MapComponentRegistry,
  MapActionRegistry,
  MemoryManifestCache,
  InMemoryTriggerBus,
  ConsoleAuditSink,
} from '@cir/runtime';

function App() {
  const { confirm, Portal } = useReactConfirmation();

  const services = useMemo(() => {
    const cache = new MemoryManifestCache();
    const fetcher = new ManifestFetcher({ baseUrl: '/api' });
    const resolver = new ManifestResolver({ fetcher, cache });
    const registry = new MapComponentRegistry({
      /* ... bind components ... */
    });
    const actions = new MapActionRegistry();
    const bus = new InMemoryTriggerBus();
    const dispatcher = new ActionDispatcher({
      capabilities: {
        /* capability schemas */
      },
      registry: actions,
      confirm,
    });
    return {
      identity: { user_id, app_id },
      resolver,
      dispatcher,
      registry,
      bus,
      audit: new ConsoleAuditSink(),
    };
  }, [confirm]);

  return (
    <CirRuntime services={services} confirm={confirm}>
      <CirRoute path="/today" />
      <Portal />
    </CirRuntime>
  );
}
```

## Hooks

| Hook                     | Returns                                          | Use                                                                   |
| ------------------------ | ------------------------------------------------ | --------------------------------------------------------------------- |
| `useCir()`               | `CirRuntimeServices`                             | Bottom of the bag — every other hook depends on this.                 |
| `useManifest(path)`      | `{ manifest, isLoading, error, refresh }`        | Resolve a manifest for a route. Re-fetches when path changes.         |
| `useDispatcher()`        | `(capabilityId, input) => Promise<ActionResult>` | Dispatch a capability with `ctx` auto-wired from identity + manifest. |
| `useTrigger(type, fn)`   | `void`                                           | Subscribe to a trigger event. Auto-cleanup on unmount.                |
| `useReactConfirmation()` | `{ confirm, Portal }`                            | Returns a `ConfirmationCallback` + a portal to render somewhere.      |
| `useOptimisticAction()`  | `{ invoke, busy, toast }`                        | Optimistic-UI wrapper around an action. Auto-detects from capability. |

## Optimistic UI — `useOptimisticAction()`

`useOptimisticAction()` standardizes the apply-rollback-toast loop. Hosts
pass the action callback plus the `Capability` declaration; the hook reads
`capability.reversible && capability.low_stakes` and engages the optimistic
path automatically. No opt-in flag required.

```tsx
import { useOptimisticAction, useDispatcher } from '@cir/react';
import { CAPABILITIES } from './capabilities';

function CartButton({ productId }: { productId: number }) {
  const dispatch = useDispatcher();
  const [count, setCount] = useState(0);

  const { invoke, busy, toast } = useOptimisticAction<{ product_id: number }>({
    action: (input) => dispatch('cart.add', input),
    capability: CAPABILITIES['cart.add'], // reversible: true + low_stakes: true
    applyOptimistic: () => setCount((n) => n + 1),
    rollback: () => setCount((n) => n - 1),
  });

  return (
    <>
      <button disabled={busy} onClick={() => invoke({ product_id: productId })}>
        Add to cart ({count})
      </button>
      {toast && <Toast variant={toast.kind}>{toast.message}</Toast>}
    </>
  );
}
```

When `capability` is omitted, the hook keeps its pre-Wave-7a behavior
(always optimistic) — existing components like `DecisionQueue` and
`TaskQueue` keep working without changes. When the capability is supplied
but lacks either flag, `applyOptimistic` and `rollback` are NOT invoked
even on failure — the user sees the round-trip via the `busy` state and
the failure via the toast.

## Confirmation portal

Two patterns:

**Default**: Omit the `confirm` prop on `<CirRuntime>`. The provider mounts a
default portal as the last child of the tree. The dispatcher is unaware of
React; you wire the confirm callback into it manually if you want it to use
the same portal (see Quick start).

**Custom**: Pass your own `ConfirmationCallback` via `<CirRuntime
confirm={...}>`. The default portal is suppressed. Hosts that need a styled
modal, a voice prompt, or any other confirmation surface drop in a custom
callback.

The built-in portal is intentionally unstyled. It uses a native `<dialog>`
with semantic markup (`<h2>`, `<p>`, `<button>`) and queues subsequent
requests so the user never sees overlapping modals. Confirm/cancel/escape
all resolve the request promise.

## DataResolver protocol

Components shipped via `@cir/components` (or any host registry) often bind to
data via the manifest's `data` spec (`{ source, filter, sort, group_by }`).
The runtime keeps that spec opaque — the adapter resolves it at render time
through a `DataResolver` provided by the host:

```ts
const dataResolver: DataResolver = (binding) => {
  return fetch(`/data/${binding.source}?${queryFor(binding)}`).then((r) => r.json());
};

<CirRuntime services={services} dataResolver={dataResolver}>
  <CirRoute path="/today" />
</CirRuntime>;
```

Components receive `data`, `loading`, and `error` props once the resolver
settles. Default behavior (no host-provided resolver): `EmptyDataResolver`,
which returns `undefined` for every binding so components fall through to
their empty state.

## Background

- [`docs/architecture.md`](../../docs/architecture.md) §"Data flow: the hot
  path (render)" — the path this adapter implements.
- [`@cir/runtime`](../runtime/README.md) — the framework-agnostic core this
  package adapts.

## Debug panel — `@cir/react/debug`

Optional dev-only surface that subscribes to a `StreamingAuditSink` (from
`@cir/runtime`) and renders a floating, filterable event log. Imported
from a separate subpath so a production bundle can tree-shake it:

```tsx
import { DebugPanel } from '@cir/react/debug';
// keep the import behind a NODE_ENV check or a feature flag in your host
{
  process.env.NODE_ENV !== 'production' && <DebugPanel sink={auditSink} />;
}
```

The same sink can be tailed from a terminal via `cir dev --tail` against
the demo's `/api/cir/audit/stream` SSE endpoint — both observers share
one backlog buffer and one event stream.

## Testing

`@cir/react/testing` exports `renderWithCir(ui, options)` and
`buildTestServices(options)` for downstream test suites. They wire in
`@cir/runtime/testing`'s in-memory primitives (`MemoryManifestCache`,
`InMemoryTriggerBus`, `Map*Registry`, `ALWAYS_CONFIRM`) so consumer tests
don't have to.
