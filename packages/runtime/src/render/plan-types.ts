// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Render plan types — the framework-agnostic node tree the adapter maps to
 * concrete UI. The runtime produces a `RenderPlan` from `(manifest, route)`;
 * the adapter walks it and renders.
 *
 * The RenderPlan is a thin transformation of `Manifest.routes[i].layout`:
 *  - Each `LayoutNode.component` is resolved against the registry into a
 *    `ComponentBinding` (or `undefined` if the registry doesn't know it).
 *  - `data` and `actions` pass through unchanged.
 *  - `children` recurse into more `RenderNode`s.
 *
 * The plan carries the `routePath`, the route `title`, and any `refresh`
 * policy from the manifest so the adapter can wire focus/interval refresh
 * without re-reading the manifest.
 */

import type { ComponentBinding } from '../registry/component-registry.js';

export interface RenderPlan {
  routePath: string;
  title?: string;
  root: RenderNode;
  refresh?: { dataPolicy: string; structurePolicy: string };
}

export interface RenderNode {
  componentId: string;
  /**
   * Resolved binding from the registry. May be undefined when the registry
   * does not know `componentId`. Adapters should render an explicit fallback
   * (skeleton, error chip, "missing component" UI) in that case rather than
   * crashing — the rest of the manifest may still be useful.
   */
  binding?: ComponentBinding;
  /**
   * Data binding spec from the manifest, copied verbatim. The optional
   * `empty_state` / `loading_state` / `error_state` slots are forwarded as
   * nested `RenderNode`s so the adapter can render them in place of the
   * data-bound component when the resolver returns empty / loading / error
   * (Phase 2 #4 — resolver fallback contract). Adapters that do not consult
   * the slots simply ignore them.
   */
  data?: {
    source: string;
    filter?: string;
    sort?: string;
    group_by?: string;
    empty_state?: RenderNode;
    loading_state?: RenderNode;
    error_state?: RenderNode;
  };
  /** Capability IDs the adapter should wire to the dispatcher. */
  actions?: readonly string[];
  /** Free-form props bag from the manifest (passed through). */
  props?: Readonly<Record<string, unknown>>;
  /**
   * Component id of a row factory for data-bound collections. Pass-through
   * of `LayoutNode.row_binding`; the adapter resolves it against the same
   * registry it used to find `binding` and threads the resolved factory as
   * the host component's `renderItem` prop. Each row item is passed as
   * `props.data` to the row factory. See `docs/ethos.md` §"Composition,
   * not invention".
   */
  rowBinding?: string;
  children: readonly RenderNode[];
}
