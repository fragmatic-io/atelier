// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Shared types for `@cir/data-resolvers`.
 *
 * The `DataResolver` protocol itself is owned by `@cir/react` so the React
 * render walker can consume it without dragging in resolver implementations.
 * We re-export it from this package's barrel for convenience.
 *
 * `DataBinding` is a verbatim copy of the runtime's binding shape (kept in
 * sync with `@cir/schemas` `ComponentDataBinding` and `@cir/react`'s own
 * duplicate). We declare it locally so this package does not take a peer
 * dependency on React just to import a type.
 */

import type { Capability } from '@cir/schemas';

/**
 * The verbatim manifest data binding the resolver receives.
 *
 * Mirrors `ComponentDataBindingSchema` from `@cir/schemas` and `DataBinding`
 * from `@cir/react/data-resolver`. Duplicating this type avoids a hard
 * dependency from `@cir/data-resolvers` onto `@cir/react`.
 */
export interface DataBinding {
  source: string;
  filter?: string;
  sort?: string;
  group_by?: string;
}

/**
 * A resolver returns a value (or a promise) describing the bound data.
 * Returning `undefined` means "no data for this binding" — components should
 * render their empty state. Throwing or rejecting is surfaced as `error`.
 */
export type DataResolver = (binding: DataBinding) => unknown;

/**
 * A `Capability` registry the resolvers can look up by capability id. Both
 * a `Map` and a plain object are accepted — most callers find a `Record`
 * ergonomic, but adapters internally treat them uniformly.
 */
export type CapabilityLookup =
  | Map<string, Capability>
  | Record<string, Capability>
  | ReadonlyMap<string, Capability>;

/** Resolve a capability id from any supported lookup shape. */
export function lookupCapability(
  capabilities: CapabilityLookup,
  id: string,
): Capability | undefined {
  if (capabilities instanceof Map) {
    return capabilities.get(id);
  }
  // Record<string, Capability>
  return (capabilities as Record<string, Capability>)[id];
}
