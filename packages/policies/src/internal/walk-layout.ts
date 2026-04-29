// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Recursive walker over a manifest's `LayoutNode` tree.
 *
 * Multiple baseline policies need to traverse every node in every route,
 * collecting JSON Pointer paths as they go. This module owns the recursion
 * once so the policies stay focused on their assertions.
 */

import type { LayoutNode, Manifest, Route } from '@cir/schemas';

/** Visitor invoked for every layout node in a route, with its JSON Pointer path. */
export type LayoutVisitor = (node: LayoutNode, path: string, ancestors: LayoutNode[]) => void;

/**
 * Encode a single JSON Pointer path segment per RFC 6901: `~` -> `~0`, `/` -> `~1`.
 * Numeric array indices and most identifiers don't trigger this, but routes can
 * carry arbitrary strings.
 */
export function escapeJsonPointerSegment(segment: string | number): string {
  return String(segment).replaceAll('~', '~0').replaceAll('/', '~1');
}

/**
 * Walk every layout node across every route in a manifest.
 *
 * The visitor receives:
 *  - `node`: the current `LayoutNode`
 *  - `path`: the JSON Pointer rooted at the manifest (e.g. `/routes/1/layout/children/0`)
 *  - `ancestors`: layout nodes from the route's root down to (but not including) `node`
 */
export function walkManifest(manifest: Manifest, visit: LayoutVisitor): void {
  manifest.routes.forEach((route, routeIdx) => {
    if (!route.layout) return;
    const rootPath = `/routes/${routeIdx}/layout`;
    walkLayout(route.layout, rootPath, [], visit);
  });
}

/**
 * Walk a single layout subtree. Used directly by callers who already have
 * a route in hand; `walkManifest` calls this for every route.
 */
export function walkLayout(
  node: LayoutNode,
  path: string,
  ancestors: LayoutNode[],
  visit: LayoutVisitor,
): void {
  visit(node, path, ancestors);
  if (node.children) {
    const nextAncestors = [...ancestors, node];
    node.children.forEach((child, idx) => {
      walkLayout(child, `${path}/children/${idx}`, nextAncestors, visit);
    });
  }
}

/**
 * Iterator-style helper for callers that want to filter or short-circuit.
 * Not used by the baseline policies (they pass a visitor) but useful for tests.
 */
export function collectLayoutNodes(
  manifest: Manifest,
): Array<{ node: LayoutNode; path: string; route: Route }> {
  const out: Array<{ node: LayoutNode; path: string; route: Route }> = [];
  manifest.routes.forEach((route, routeIdx) => {
    if (!route.layout) return;
    const rootPath = `/routes/${routeIdx}/layout`;
    walkLayout(route.layout, rootPath, [], (node, path) => {
      out.push({ node, path, route });
    });
  });
  return out;
}
