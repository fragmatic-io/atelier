// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Data resolver protocol — how components shipped through `@atelier/components`
 * fetch their own data when a manifest binds them to a `data.source`.
 *
 * The render walker reads a node's `data` (the verbatim binding from the
 * manifest, see `@atelier/runtime/render/plan-types.ts`) and asks the
 * `DataResolver` for the actual records. The resolver is provided once at
 * the provider level. Hosts wire their own (REST, GraphQL, in-memory store,
 * etc.); we expose `EmptyDataResolver` as a sentinel so components can
 * function without a host wiring data — they just receive `undefined`.
 *
 * Why this lives here and not in `@atelier/runtime`: the runtime is framework-
 * agnostic and does not call the resolver itself — the React render walker
 * does, because only it knows component lifecycle.
 */

import { createContext } from 'react';
import type { StructuredFilter, StructuredSort } from '@atelier/schemas';

/**
 * Verbatim copy of the runtime's data binding shape (see plan-types.ts).
 * Duplicated here to avoid importing types-only from a deeper module path
 * across packages.
 *
 * Sprint 2.4 / P3 — `filter` accepts either the CEL-like string form
 * (`status == 'pending'`) or a `StructuredFilter` object (the form the
 * LLM tends to emit naturally). Resolvers that only know how to handle
 * strings can route through `formatFilterAsString` from
 * `@atelier/runtime` to coerce.
 */
export interface DataBinding {
  source: string;
  filter?: string | StructuredFilter;
  // 2026-05-06 — widened to mirror `ComponentDataBindingSchema.sort` in
  // `@atelier/schemas`. The string form follows `"-created_at, +id"`;
  // the structured form is what the LLM emits naturally for multi-field
  // ordering. See `formatSortAsString` / `applySort` in
  // `@atelier/runtime/data/filter-utils` for the round-trip helpers.
  sort?: string | StructuredSort;
  group_by?: string;
}

/**
 * Resolver signature. Returning `undefined` is meaningful: the component
 * receives `data: undefined` and is expected to render an empty state.
 * Throwing or returning a rejected promise surfaces as `error` on the
 * component's props.
 *
 * Wave 10 / S-3 — resolvers MAY also expose an optional `subscribe(binding)`
 * method on the function itself for live streaming. Mirrored from
 * `@atelier/data-resolvers` so the React render walker and the new
 * `useSubscription` hook can call it without taking a hard dependency on
 * the resolver implementation package. Hosts that don't implement
 * subscriptions return `undefined` (or simply don't define the method).
 */
export type DataResolver = ((binding: DataBinding) => unknown) & {
  subscribe?: (binding: DataBinding) => AsyncIterable<unknown> | undefined;
};

/** Default resolver: returns `undefined` for every binding. */
export const EmptyDataResolver: DataResolver = () => undefined;

/**
 * Provider-scoped resolver context. The provider seeds it; the render
 * walker reads it. Components do NOT consume this context directly — they
 * receive resolved `data`/`loading`/`error` props from the walker.
 */
export const DataResolverContext = createContext<DataResolver>(EmptyDataResolver);
