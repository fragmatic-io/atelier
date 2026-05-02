// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `buildRenderPlan(manifest, routePath, registry)` — turn a `Manifest` into
 * a framework-agnostic node tree the adapter can walk.
 *
 * Pure function. No side effects. Safe to call repeatedly with the same
 * inputs (e.g. on every adapter render pass). The runtime caches `Manifest`
 * objects, not `RenderPlan` objects — building a plan is cheap.
 *
 * Contract:
 *  - Throws `RouteNotFoundError` when `routePath` is not in the manifest.
 *  - Redirect-only routes (no `layout`) throw `RouteNotRenderableError` to
 *    distinguish "redirect handled at the router layer" from "missing layout".
 *    Hosts should consult `manifest.routes[i].redirect` before calling
 *    `buildRenderPlan`.
 *  - Missing component bindings yield `binding: undefined`. The adapter
 *    decides whether to render a fallback, throw, or hide.
 */

import type { LayoutNode, Manifest, Route } from '@atelier/schemas';
import type { ComponentRegistry } from '../registry/component-registry.js';
import type { RenderNode, RenderPlan } from './plan-types.js';

export class RouteNotFoundError extends Error {
  readonly routePath: string;
  constructor(routePath: string) {
    super(`Route not found in manifest: ${routePath}`);
    this.name = 'RouteNotFoundError';
    this.routePath = routePath;
  }
}

export class RouteNotRenderableError extends Error {
  readonly routePath: string;
  constructor(routePath: string, reason: string) {
    super(`Route ${routePath} is not renderable: ${reason}`);
    this.name = 'RouteNotRenderableError';
    this.routePath = routePath;
  }
}

export function buildRenderPlan(
  manifest: Manifest,
  routePath: string,
  registry: ComponentRegistry,
): RenderPlan {
  const route = manifest.routes.find((r) => r.path === routePath);
  if (!route) throw new RouteNotFoundError(routePath);
  if (!route.layout) {
    throw new RouteNotRenderableError(
      routePath,
      route.redirect
        ? `route is a redirect to ${route.redirect}; resolve before rendering`
        : 'route has no layout',
    );
  }
  const root = buildRenderNode(route.layout, registry);
  return assemble(routePath, route, root);
}

function assemble(routePath: string, route: Route, root: RenderNode): RenderPlan {
  const plan: RenderPlan = { routePath, root };
  if (route.title !== undefined) plan.title = route.title;
  if (route.refresh) {
    plan.refresh = {
      dataPolicy: route.refresh.data,
      structurePolicy: route.refresh.structure,
    };
  }
  return plan;
}

function buildRenderNode(node: LayoutNode, registry: ComponentRegistry): RenderNode {
  const binding = registry.get(node.component);
  const children = (node.children ?? []).map((child) => buildRenderNode(child, registry));
  const out: RenderNode = {
    componentId: node.component,
    children,
  };
  if (binding) out.binding = binding;
  if (node.data) {
    const data: NonNullable<RenderNode['data']> = { source: node.data.source };
    if (node.data.filter !== undefined) data.filter = node.data.filter;
    if (node.data.sort !== undefined) data.sort = node.data.sort;
    if (node.data.group_by !== undefined) data.group_by = node.data.group_by;
    // Forward empty/loading/error state slots as nested RenderNodes so the
    // adapter can render them in place of the data-bound component when the
    // resolver returns empty / loading / error. The slots themselves are
    // recursively planned through the registry (they may name their own
    // components — `EmptyState`, `Skeleton`, `Alert`, ...).
    if (node.data.empty_state !== undefined) {
      data.empty_state = buildRenderNode(node.data.empty_state, registry);
    }
    if (node.data.loading_state !== undefined) {
      data.loading_state = buildRenderNode(node.data.loading_state, registry);
    }
    if (node.data.error_state !== undefined) {
      data.error_state = buildRenderNode(node.data.error_state, registry);
    }
    out.data = data;
  }
  if (node.actions && node.actions.length > 0) out.actions = [...node.actions];
  if (node.props) out.props = { ...node.props };
  if (node.row_binding !== undefined) out.rowBinding = node.row_binding;
  return out;
}
