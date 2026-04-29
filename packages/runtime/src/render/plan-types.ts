// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
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
  /** Data binding spec from the manifest, copied verbatim. */
  data?: { source: string; filter?: string; sort?: string; group_by?: string };
  /** Capability IDs the adapter should wire to the dispatcher. */
  actions?: readonly string[];
  /** Free-form props bag from the manifest (passed through). */
  props?: Readonly<Record<string, unknown>>;
  children: readonly RenderNode[];
}
