// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Cursor pagination protocol for `DataResolver` (Wave 10 / S-2).
 *
 * Renders past ~500 items become a wall of DOM that browsers struggle with.
 * `<VirtualList>` / `<VirtualTable>` (the rendering side of S-2) need a way
 * to ask the resolver for "the next page" without having to know whether
 * the underlying transport is REST, GraphQL, OpenAPI, or a fixture map.
 * This file ships the contract:
 *
 *   - {@link CursorPaginatedResult} — the shape a paginating resolver may
 *     return instead of a plain array.
 *   - {@link DataBinding} gains optional `cursor` / `limit` / `pagination`
 *     fields (see `types.ts`). Setting `pagination: 'cursor'` is the
 *     opt-in signal for resolvers that support it.
 *   - {@link paginate} — a helper that walks a paginated resolver to
 *     completion. Useful for tests, demos, and "fetch everything for an
 *     export" workflows. The runtime never calls this in the hot path —
 *     the virtual components stream pages on scroll instead.
 *
 * Back-compat: the existing protocol is unchanged. Resolvers that return
 * plain arrays continue to work; the cursor contract is purely additive.
 * `pagination: 'none'` is the default everywhere.
 */

import type { DataBinding, DataResolver } from './types.js';

/**
 * Pagination mode declared on a `DataBinding`. Defaults to `'none'`
 * (all items returned in one shot). `'cursor'` opts the binding into the
 * `CursorPaginatedResult` contract; `'offset'` is reserved for legacy
 * `skip` / `limit` adapters that page by index rather than opaque cursor.
 */
export type PaginationMode = 'cursor' | 'offset' | 'none';

/**
 * Result envelope a resolver returns when the binding requests cursor-based
 * pagination. `next_cursor` is the only required token semantically: when
 * undefined, the iterator is exhausted. `prev_cursor` is optional and only
 * meaningful for bidirectional UIs (most virtual lists are forward-only).
 *
 * `total` is "best-effort" — many real APIs (cursor-paginated GraphQL
 * connections, Firestore queries) cannot cheaply return a count. Components
 * that want a scrollbar position must fall back to estimated heights when
 * `total` is undefined.
 */
export interface CursorPaginatedResult<T = unknown> {
  /** The page of items. Empty arrays are valid (e.g. tail-page). */
  items: readonly T[];
  /** Opaque server-issued token for the next page. `undefined` means "no more". */
  next_cursor?: string | undefined;
  /** Opaque server-issued token for the previous page. */
  prev_cursor?: string | undefined;
  /** Total item count when known. Often undefined for cursor APIs. */
  total?: number | undefined;
}

/**
 * Type guard distinguishing a `CursorPaginatedResult` from a plain array
 * payload. The runtime virtual list uses this to decide whether to thread
 * `next_cursor` back through the next request or treat the resolver as a
 * legacy "all-at-once" source.
 */
export function isCursorPaginatedResult<T = unknown>(
  value: unknown,
): value is CursorPaginatedResult<T> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { items?: unknown };
  return Array.isArray(candidate.items);
}

/**
 * Options for {@link paginate}.
 */
export interface PaginateOptions {
  /** Maximum number of pages to fetch. Defaults to 100. Set higher for full-export flows. */
  maxPages?: number;
}

/**
 * Walk a cursor-paginated resolver to completion, accumulating every page
 * into a single flat array. Useful for tests, exports, and offline / SSR
 * scenarios where the host wants the materialised set rather than the
 * scroll-driven stream.
 *
 * Behaviour:
 *  - Each iteration calls `resolver({ ...binding, cursor, pagination: 'cursor' })`.
 *  - The first call has no `cursor`; subsequent calls reuse `next_cursor`.
 *  - Loops until `next_cursor` is undefined OR `maxPages` is reached.
 *  - If a page comes back as a plain array (resolver doesn't support
 *    pagination), the array is returned as-is — exits after one fetch.
 *  - `maxPages` defaults to 100; this is a safety valve, not a budget.
 *    Hosts that need more pages should pass an explicit higher cap.
 *
 * Returns the concatenated items. Throws if the resolver throws.
 */
export async function paginate<T = unknown>(
  resolver: DataResolver,
  binding: DataBinding,
  options: PaginateOptions = {},
): Promise<readonly T[]> {
  const maxPages = options.maxPages ?? 100;
  const out: T[] = [];
  let cursor: string | undefined;
  let pages = 0;

  // First request reuses the binding's pagination + limit and adds the
  // cursor header (which starts undefined). We don't force the binding
  // into `'cursor'` mode if the caller didn't ask for it — the helper is
  // a convenience over a resolver the caller has already opted in.
  const baseBinding: DataBinding = {
    ...binding,
    pagination: binding.pagination ?? 'cursor',
  };

  while (pages < maxPages) {
    const requested: DataBinding = cursor === undefined ? baseBinding : { ...baseBinding, cursor };
    const raw = await resolver(requested);
    pages += 1;

    if (raw === undefined || raw === null) {
      // Nothing to add; exit. A resolver returning undefined on the first
      // call is treated as "no data" — same shape as the runtime's empty
      // state contract.
      return out;
    }

    if (Array.isArray(raw)) {
      // Legacy resolver that doesn't paginate — take what it gave us and
      // exit. We do NOT keep iterating against a cursor it didn't issue.
      out.push(...(raw as T[]));
      return out;
    }

    if (!isCursorPaginatedResult<T>(raw)) {
      // Unknown shape — the resolver returned something we can't iterate.
      // Treat as terminal; the runtime virtual list will surface the raw
      // value through its own path.
      return out;
    }

    out.push(...raw.items);
    if (raw.next_cursor === undefined) return out;
    cursor = raw.next_cursor;
  }

  return out;
}
