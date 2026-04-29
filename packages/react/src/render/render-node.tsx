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

const warned = new Set<string>();

function warnMissingBinding(componentId: string): void {
  if (warned.has(componentId)) return;
  warned.add(componentId);
  console.warn(`[cir/react] No component binding registered for "${componentId}"`);
}

/** Test-only: clear the de-dup set so successive tests can assert warnings. */
export function __resetMissingBindingWarnings(): void {
  warned.clear();
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

  if (node.data) {
    props['data'] = data;
    props['loading'] = loading;
    props['error'] = error;
  }

  for (const capabilityId of node.actions ?? []) {
    props[capabilityId] = (input?: unknown) => dispatch(capabilityId, input);
  }

  const children: ReactNode =
    node.children.length > 0
      ? node.children.map((child, i) => <RenderNode key={i} node={child} />)
      : undefined;

  return createElement(Component, props, children);
}
