# @atelier/react

The React adapter for [`@atelier/runtime`](../runtime/README.md).

This package is the bridge between Atelier's framework-agnostic runtime core and
React. It provides:

- A **provider** (`<CirRuntime>`) that puts the runtime services on a React
  context.
- **Hooks** for resolving manifests, dispatching actions, subscribing to
  triggers, and wiring confirmation modals.
- A **`<CirRoute>` walker** that maps a `RenderPlan` into a JSX tree.
- A semantic `<dialog>`-based **confirmation portal** that satisfies the
  runtime's `ConfirmationCallback` contract.

The package does **not** ship UI components — those live in
[`@atelier/components`](../components/README.md). The adapter receives the
`ComponentRegistry` as services and renders whatever bindings the host
provides. ETHOS principle 7: the render runtime is dumb on purpose.

## Next.js / React Server Components

Every file that uses hooks, context, or class state ships with the
`'use client'` directive. You can import `@atelier/react` from a Server
Component without a wrapper — Next.js will route the boundary correctly:

```tsx
// app/today/page.tsx — Server Component
import { CirRuntime, CirRoute } from '@atelier/react';
import { buildServices } from '@/lib/cir-services';

export default function TodayPage() {
  return (
    <CirRuntime services={buildServices()}>
      <CirRoute path="/today" />
    </CirRuntime>
  );
}
```

`@atelier/components` is mostly server-component-friendly (pure functional
components with no state); only `ConfirmDialog` is client-only.
`@atelier/runtime`, `@atelier/policies`, and `@atelier/schemas` are pure
TypeScript with no React dependencies — safe to import from anywhere.

## Quick start

```tsx
import { CirRuntime, CirRoute, useReactConfirmation } from '@atelier/react';
import {
  ManifestFetcher,
  ManifestResolver,
  ActionDispatcher,
  MapComponentRegistry,
  MapActionRegistry,
  MemoryManifestCache,
  InMemoryTriggerBus,
  ConsoleAuditSink,
} from '@atelier/runtime';

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

| Hook                     | Returns                                          | Use                                                                                      |
| ------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `useCir()`               | `CirRuntimeServices`                             | Bottom of the bag — every other hook depends on this.                                    |
| `useManifest(path)`      | `{ manifest, isLoading, error, refresh }`        | Resolve a manifest for a route. Re-fetches when path changes.                            |
| `useDispatcher()`        | `(capabilityId, input) => Promise<ActionResult>` | Dispatch a capability with `ctx` auto-wired from identity + manifest.                    |
| `useTrigger(type, fn)`   | `void`                                           | Subscribe to a trigger event. Auto-cleanup on unmount.                                   |
| `useReactConfirmation()` | `{ confirm, Portal }`                            | Returns a `ConfirmationCallback` + a portal to render somewhere.                         |
| `useOptimisticAction()`  | `{ invoke, busy, toast }`                        | Optimistic-UI wrapper around an action. Auto-detects from capability.                    |
| `useMultiSelect()`       | `{ selected, toggle, selectRange, ... }`         | Stateful multi-select for `<List>` / `<Table>` / `<Grid>`. Pairs with `<BulkActionBar>`. |

## Optimistic UI — `useOptimisticAction()`

`useOptimisticAction()` standardizes the apply-rollback-toast loop. Hosts
pass the action callback plus the `Capability` declaration; the hook reads
`capability.reversible && capability.low_stakes` and engages the optimistic
path automatically. No opt-in flag required.

```tsx
import { useOptimisticAction, useDispatcher } from '@atelier/react';
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

## Multi-select — `useMultiSelect()`

`useMultiSelect()` owns a `Set<TId>` of selected row ids and exposes the
canonical primitives a host needs to drive a Linear-style multi-select:
`toggle`, `selectRange`, `selectAll`, `clear`, plus the read-only
`selected` set and an `isSelected(id)` predicate. The hook pairs with
the `<List>`, `<Table>`, and `<Grid>` `selectable` / `bulkActions`
integration shipped from
[`@atelier/components`](../components/README.md#selectable-lists-tables-and-grids-wave-7b--int-9--wave-7c--track-a) —
just pipe `selected` into the component's `selectedIds` prop.

```tsx
import { useEffect, useRef } from 'react';
import { useMultiSelect, useDispatcher } from '@atelier/react';
import { Table, type BulkAction } from '@atelier/components';

interface Issue {
  id: string;
  title: string;
  state: 'open' | 'closed';
}

const ACTIONS: readonly BulkAction[] = [
  { id: 'github.issue.bulk_close', label: 'Close', confirmation: 'modal' },
  { id: 'github.issue.bulk_archive', label: 'Archive' },
  {
    id: 'github.issue.bulk_delete',
    label: 'Delete',
    variant: 'destructive',
    confirmation: 'modal',
  },
];

export function IssueTriage({ issues }: { issues: readonly Issue[] }) {
  const dispatch = useDispatcher();
  const ms = useMultiSelect<string>();
  const rootRef = useRef<HTMLDivElement>(null);

  // Wire Cmd/Ctrl+A → selectAll, Esc → clear at the document root for
  // the lifetime of this view. `bind` reads `allIds` lazily so the
  // selection always references the current row set.
  useEffect(() => {
    return ms.bind(() => issues.map((i) => i.id));
  }, [ms, issues]);

  return (
    <div ref={rootRef}>
      <Table
        columns={[
          { key: 'title', header: 'Title' },
          { key: 'state', header: 'State' },
        ]}
        rows={issues.map((i) => ({ ...i }))}
        selectable
        idOf={(row, i) => (typeof row.id === 'string' ? row.id : String(i))}
        selectedIds={ms.selected}
        onSelectionChange={(next) => {
          // Replace the whole set in one shot — the component already
          // computed the next selection (toggle / shift-range).
          ms.selectAll(Array.from(next));
        }}
        bulkActions={ACTIONS}
        onBulkAction={async (actionId) => {
          await dispatch(actionId, { ids: Array.from(ms.selected) });
          ms.clear();
        }}
      />
    </div>
  );
}
```

The hook's surface:

| Member                          | Returns / Effect                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `selected: ReadonlySet<TId>`    | Read-only view of the current set.                                                           |
| `isSelected(id)`                | `true` if `id` is in the set.                                                                |
| `toggle(id)`                    | Add if absent, remove if present.                                                            |
| `selectRange(from, to, allIds)` | Inclusive range select. `from`/`to` need not be adjacent.                                    |
| `selectAll(allIds)`             | Replace the set with every id in `allIds`.                                                   |
| `clear()`                       | Empty the set.                                                                               |
| `bind(() => allIds)`            | Wire `Cmd/Ctrl+A` (selectAll) and `Esc` (clear) at the document. Returns a cleanup function. |

The selection set is plain `Set<string>` (or your TId union — pass it as
the type parameter for stronger row-id typing). Components from
`@atelier/components` accept this set verbatim via their `selectedIds`
prop — no adapter glue required.

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

Components shipped via `@atelier/components` (or any host registry) often bind to
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
- [`@atelier/runtime`](../runtime/README.md) — the framework-agnostic core this
  package adapts.

## Debug panel — `@atelier/react/debug`

Optional dev-only surface that subscribes to a `StreamingAuditSink` (from
`@atelier/runtime`) and renders a floating, filterable event log. Imported
from a separate subpath so a production bundle can tree-shake it:

```tsx
import { DebugPanel } from '@atelier/react/debug';
// keep the import behind a NODE_ENV check or a feature flag in your host
{
  process.env.NODE_ENV !== 'production' && <DebugPanel sink={auditSink} />;
}
```

The same sink can be tailed from a terminal via `atelier dev --tail` against
the demo's `/api/cir/audit/stream` SSE endpoint — both observers share
one backlog buffer and one event stream.

## Testing

`@atelier/react/testing` exports `renderWithCir(ui, options)` and
`buildTestServices(options)` for downstream test suites. They wire in
`@atelier/runtime/testing`'s in-memory primitives (`MemoryManifestCache`,
`InMemoryTriggerBus`, `Map*Registry`, `ALWAYS_CONFIRM`) so consumer tests
don't have to.
