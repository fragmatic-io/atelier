// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Shared types for `@atelier/data-resolvers`.
 *
 * The `DataResolver` protocol itself is owned by `@atelier/react` so the React
 * render walker can consume it without dragging in resolver implementations.
 * We re-export it from this package's barrel for convenience.
 *
 * `DataBinding` is a verbatim copy of the runtime's binding shape (kept in
 * sync with `@atelier/schemas` `ComponentDataBinding` and `@atelier/react`'s own
 * duplicate). We declare it locally so this package does not take a peer
 * dependency on React just to import a type.
 */

import type { Capability } from '@atelier/schemas';

/**
 * The verbatim manifest data binding the resolver receives.
 *
 * Mirrors `ComponentDataBindingSchema` from `@atelier/schemas` and `DataBinding`
 * from `@atelier/react/data-resolver`. Duplicating this type avoids a hard
 * dependency from `@atelier/data-resolvers` onto `@atelier/react`.
 *
 * Wave 10 / S-2 — added optional `cursor` / `limit` / `pagination` fields
 * for the cursor pagination protocol consumed by `<VirtualList>` /
 * `<VirtualTable>`. All three are back-compatible — resolvers that ignore
 * them continue to work; bindings without `pagination` default to `'none'`
 * (single-shot delivery). See `cursor.ts` for the full contract.
 */
export interface DataBinding {
  source: string;
  filter?: string;
  sort?: string;
  group_by?: string;
  /**
   * Wave 10 / S-2 — opaque server-issued cursor identifying where the next
   * page begins. Undefined on the first call. Resolvers that emit a
   * `CursorPaginatedResult` thread their `next_cursor` back through this
   * field on the next request.
   */
  cursor?: string | undefined;
  /**
   * Wave 10 / S-2 — page size. Hosts can use this to clamp transport-side
   * fetches; the virtual list defaults to a sensible window when omitted.
   */
  limit?: number | undefined;
  /**
   * Wave 10 / S-2 — pagination mode. Defaults to `'none'` (legacy single
   * payload). Setting to `'cursor'` opts into the `CursorPaginatedResult`
   * envelope; `'offset'` is reserved for legacy `skip` / `limit` adapters.
   */
  pagination?: 'cursor' | 'offset' | 'none' | undefined;
}

/**
 * A resolver returns a value (or a promise) describing the bound data.
 * Returning `undefined` means "no data for this binding" — components should
 * render their empty state. Throwing or rejecting is surfaced as `error`.
 *
 * Wave 10 / S-3 — resolvers MAY also expose an optional `subscribe(binding)`
 * method on the function itself for live streaming. Hosts that don't
 * implement subscriptions return `undefined` from `subscribe` (or simply
 * don't define the method). The shape is a property on the resolver
 * function — same pattern `withCache(...)` uses for `.size()` /
 * `.evict()`. This stays back-compat: every existing resolver still
 * satisfies the protocol because `subscribe` is optional.
 *
 * The async-iterable contract:
 *   - Each `next()` yields one event payload (already parsed/decoded).
 *   - Iterator completion (return `{ done: true }`) signals end-of-stream.
 *   - Iterator throws to surface a transport error to the consumer.
 *   - Consumers MUST call `return()` to clean up (the React hook does
 *     this on unmount; `consumeSubscription()` wraps the same pattern).
 */
export type DataResolver = ((binding: DataBinding) => unknown) & {
  subscribe?: (binding: DataBinding) => AsyncIterable<unknown> | undefined;
};

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
