// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * `RenderNode` — internal component that walks a `RenderNode` tree (from
 * `@cir/runtime`'s `buildRenderPlan`) and renders the bound React component
 * for each node.
 *
 * Per-node behavior:
 *  - Look up `node.binding?.factory`. The runtime stores it as `unknown`
 *    (the registry is framework-agnostic). The adapter casts it to a React
 *    component type at this single location.
 *  - If no binding: render `<div data-cir-fallback={componentId}>?</div>`
 *    and `console.warn` once per missing component id.
 *  - Build props by composing:
 *      - `node.props` (verbatim from manifest)
 *      - resolved `data` / `loading` / `error` (when `node.data` is set)
 *      - one prop per `node.actions[i]` whose value is a function that
 *        dispatches the capability.
 *  - Recurse into `node.children` and pass them as `children` prop.
 *
 * Why we resolve data here and not in the component: keeps components
 * dumb. Components shipped by `@cir/components` should never need to know
 * about the runtime — they receive props.
 */

import {
  createElement,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { ComponentRegistry, RenderNode as RenderNodeShape } from '@cir/runtime';
import type { LayoutNode } from '@cir/schemas';
import { DataResolverContext, type DataBinding } from '../data/data-resolver.js';
import { useDispatcher } from '../hooks/use-dispatcher.js';
import { useCir } from '../hooks/use-cir.js';
import { BASELINE_RESOLVER_DEFAULTS } from '../context/runtime-context.js';

/**
 * Components in the catalog that accept a `density` personalisation prop.
 * Kept in lock-step with the 8 layout components in `@cir/components` that
 * actually wire density to spacing today (Stack, Container, Card, Grid, List,
 * Table, StatCard, KPIRow). The walker only defaults the prop for these IDs
 * to avoid attaching `density="..."` to a component whose props_schema does
 * not declare it (which would surface a React unknown-prop warning).
 */
const DENSITY_AWARE_COMPONENTS = new Set<string>([
  'Stack',
  'Container',
  'Card',
  'Grid',
  'List',
  'Table',
  'StatCard',
  'KPIRow',
]);

const warned = new Set<string>();
const warnedLegacyActions = new Set<string>();

function warnMissingBinding(componentId: string): void {
  if (warned.has(componentId)) return;
  warned.add(componentId);
  console.warn(`[cir/react] No component binding registered for "${componentId}"`);
}

/**
 * One-shot warning for bindings that still use the legacy
 * `props[capabilityId] = dispatch` convention. Emitted once per
 * `componentId` so devs see exactly which bindings need an `actionSlots`
 * upgrade without spamming the console on every render.
 */
function warnLegacyActionDispatch(componentId: string): void {
  if (warnedLegacyActions.has(componentId)) return;
  warnedLegacyActions.add(componentId);
  console.warn(
    `[cir/react] Component binding "${componentId}" has node.actions but no actionSlots. ` +
      `Falling back to legacy capability-id-as-prop dispatch. Declare actionSlots on the ` +
      `binding (e.g. ['onPrimaryAction']) to migrate — the legacy path is deprecated.`,
  );
}

/** Test-only: clear the de-dup set so successive tests can assert warnings. */
export function __resetMissingBindingWarnings(): void {
  warned.clear();
  warnedLegacyActions.clear();
}

function useResolvedData(binding: DataBinding | undefined): {
  data: unknown;
  loading: boolean;
  error: Error | null;
} {
  const resolver = useContext(DataResolverContext);
  const [data, setData] = useState<unknown>(undefined);
  const [loading, setLoading] = useState<boolean>(binding != null);
  const [error, setError] = useState<Error | null>(null);

  // Stable serialization for effect deps.
  const key = binding ? JSON.stringify(binding) : null;

  useEffect(() => {
    if (!binding) {
      setLoading(false);
      setData(undefined);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.resolve(resolver(binding))
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Note: `binding` is intentionally NOT in the dep array; the upstream
    // builder rebuilds it on every render. We serialize it via `key` for
    // stable equality.
  }, [resolver, key, binding]);

  return { data, loading, error };
}

/**
 * Phase 2 #4 — Resolver fallback contract.
 *
 * Returns true when the resolver-shaped `data` looks empty: `undefined`
 * (resolver had nothing to return), an empty array, or an empty object. The
 * heuristic is intentionally conservative — components that use a domain-
 * specific shape (e.g. paginated `{ items: [], total: 0 }`) keep their own
 * empty branch, so the renderer's default fires only when no rows surface
 * to the component at all.
 */
function dataLooksEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Convert a `LayoutNode` (the manifest shape) into a `RenderNode` using the
 * supplied registry. Mirrors `buildRenderNode` from `@cir/runtime` but lives
 * here because the React adapter is the only consumer that needs it for
 * default state slots resolved at render time (the upstream `buildRenderPlan`
 * already handled manifest-declared slots).
 *
 * Recursion is bounded by the slot's authored depth (typically a single
 * `<EmptyState>` / `<Skeleton>` / `<Alert>` node). Defaults are stable across
 * renders so the cost is negligible.
 */
function layoutNodeToRenderNode(node: LayoutNode, registry: ComponentRegistry): RenderNodeShape {
  const binding = registry.get(node.component);
  const children = (node.children ?? []).map((child) => layoutNodeToRenderNode(child, registry));
  const out: RenderNodeShape = {
    componentId: node.component,
    children,
  };
  if (binding) out.binding = binding;
  if (node.props) out.props = { ...node.props };
  // Default state slots are themselves UI-only — they never carry their
  // own data binding or actions. Skip those fields.
  return out;
}

/** Kind tag used as the value of `data-cir-default-state`. */
type DefaultStateKind = 'empty' | 'loading' | 'error';

export interface RenderNodeProps {
  node: RenderNodeShape;
}

export function RenderNode({ node }: RenderNodeProps): ReactElement {
  const dispatch = useDispatcher();
  const services = useCir();
  const { data, loading, error } = useResolvedData(node.data);

  if (!node.binding) {
    warnMissingBinding(node.componentId);
    const childNodes: ReactNode = node.children.map((child, i) => (
      <RenderNode key={i} node={child} />
    ));
    return <div data-cir-fallback={node.componentId}>?{childNodes}</div>;
  }

  const Component = node.binding.factory as ComponentType<Record<string, unknown>>;
  const props: Record<string, unknown> = { ...(node.props ?? {}) };

  // Personalisation defaulting: when the manifest omits a personalisation
  // prop and the active intent profile carries the corresponding signal, the
  // walker fills it in. The runtime stays "dumb" (it does not decide what to
  // show) — it is only resolving a default value for an unset prop.
  if (
    DENSITY_AWARE_COMPONENTS.has(node.componentId) &&
    props['density'] === undefined &&
    services.intent !== undefined
  ) {
    const density = services.intent.global_preferences['density'];
    if (density === 'compact' || density === 'comfortable' || density === 'spacious') {
      props['density'] = density;
    }
  }

  if (node.data) {
    props['data'] = data;
    props['loading'] = loading;
    props['error'] = error;

    // Phase 2 #4 — Resolver fallback contract. When the data binding is in a
    // loading / error / empty state, render the corresponding state slot in
    // place of the data-bound component. Slot resolution order:
    //   1. The manifest's inline `data.{loading,error,empty}_state` (already
    //      planned into a RenderNode by `buildRenderPlan`).
    //   2. The host's `services.resolverDefaults.{loading,error,empty}`.
    //   3. The framework's `BASELINE_RESOLVER_DEFAULTS`.
    // The walker tags the rendered output with `data-cir-default-state` when
    // it falls through to (2) or (3) so tests / audit tooling can detect it.
    const stateKind: DefaultStateKind | null = loading
      ? 'loading'
      : error !== null
        ? 'error'
        : dataLooksEmpty(data)
          ? 'empty'
          : null;
    if (stateKind !== null) {
      const slot = renderStateSlot(stateKind, node, services);
      if (slot !== null) return slot;
    }
  }

  // Manifest-referenced row factory (Phase 2 #3). The runtime resolves
  // `node.rowBinding` against the same registry and threads the resulting
  // factory as `renderItem` so List/Grid/Table can iterate rows without a
  // host-supplied closure. Explicit `renderItem` in props wins.
  if (node.rowBinding !== undefined && props['renderItem'] === undefined) {
    const rowBinding = services.registry.get(node.rowBinding);
    if (rowBinding) {
      const RowFactory = rowBinding.factory as ComponentType<Record<string, unknown>>;
      props['renderItem'] = (item: unknown, index: number): ReactElement =>
        createElement(RowFactory, { data: item, index, key: index });
    } else {
      warnMissingBinding(node.rowBinding);
    }
  }

  // Capability dispatch (Phase 2 #2, ethos principle #8). When the binding
  // declares ordered `actionSlots`, map each `node.actions[i]` to
  // `actionSlots[i]` — components see normal, DOM-safe React props
  // (`onPrimaryAction`). When `actionSlots` is absent we fall back to the
  // legacy capability-id-as-prop path so existing custom bindings keep
  // working, and emit a one-shot console.warn so the author knows to
  // migrate.
  const actions = node.actions ?? [];
  if (actions.length > 0) {
    const slots = node.binding.actionSlots;
    if (slots !== undefined) {
      for (let i = 0; i < actions.length; i++) {
        const capabilityId = actions[i];
        const slot = slots[i];
        if (capabilityId === undefined || slot === undefined) continue;
        props[slot] = (input?: unknown) => dispatch(capabilityId, input);
      }
    } else {
      warnLegacyActionDispatch(node.componentId);
      for (const capabilityId of actions) {
        props[capabilityId] = (input?: unknown) => dispatch(capabilityId, input);
      }
    }
  }

  const children: ReactNode =
    node.children.length > 0
      ? node.children.map((child, i) => <RenderNode key={i} node={child} />)
      : undefined;

  return createElement(Component, props, children);
}

/**
 * Resolve a state slot for a data-bound node and render it. Returns `null`
 * when no slot is available (no manifest slot, no host default, and no
 * baseline default for the kind). Wrapping div carries
 * `data-cir-default-state="empty|loading|error"` when the slot is supplied
 * by the resolver pipeline (i.e. NOT the manifest's explicit override).
 */
function renderStateSlot(
  kind: DefaultStateKind,
  node: RenderNodeShape,
  services: ReturnType<typeof useCir>,
): ReactElement | null {
  const slotKey = (
    {
      empty: 'empty_state',
      loading: 'loading_state',
      error: 'error_state',
    } as const
  )[kind];
  // (1) Inline manifest slot wins outright — it's already a RenderNode.
  const inline = node.data?.[slotKey];
  if (inline !== undefined) {
    return <RenderNode node={inline} />;
  }
  // (2) Host override on services. (3) Framework baseline.
  const overrides = services.resolverDefaults;
  const overrideNode: LayoutNode | undefined = (
    {
      empty: overrides?.empty,
      loading: overrides?.loading,
      error: overrides?.error,
    } as const
  )[kind];
  const layout: LayoutNode | undefined = overrideNode ?? BASELINE_RESOLVER_DEFAULTS[kind];
  if (layout === undefined) return null;
  const renderable = layoutNodeToRenderNode(layout, services.registry);
  return (
    <div data-cir-default-state={kind}>
      <RenderNode node={renderable} />
    </div>
  );
}
