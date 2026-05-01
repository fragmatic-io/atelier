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
import type { RenderNode as RenderNodeShape } from '@cir/runtime';
import { DataResolverContext, type DataBinding } from '../data/data-resolver.js';
import { useDispatcher } from '../hooks/use-dispatcher.js';
import { useCir } from '../hooks/use-cir.js';

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
  }

  // Capability dispatch (ethos principle #8). When the binding declares
  // ordered `actionSlots`, map each `node.actions[i]` to `actionSlots[i]`
  // — components see normal, DOM-safe React props (`onPrimaryAction`).
  // When `actionSlots` is absent we fall back to the legacy
  // capability-id-as-prop path so existing custom bindings keep working,
  // and emit a one-shot console.warn so the author knows to migrate.
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
