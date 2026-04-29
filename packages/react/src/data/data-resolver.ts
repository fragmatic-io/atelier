// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * Data resolver protocol — how components shipped through `@cir/components`
 * fetch their own data when a manifest binds them to a `data.source`.
 *
 * The render walker reads a node's `data` (the verbatim binding from the
 * manifest, see `@cir/runtime/render/plan-types.ts`) and asks the
 * `DataResolver` for the actual records. The resolver is provided once at
 * the provider level. Hosts wire their own (REST, GraphQL, in-memory store,
 * etc.); we expose `EmptyDataResolver` as a sentinel so components can
 * function without a host wiring data — they just receive `undefined`.
 *
 * Why this lives here and not in `@cir/runtime`: the runtime is framework-
 * agnostic and does not call the resolver itself — the React render walker
 * does, because only it knows component lifecycle.
 */

import { createContext } from 'react';

/**
 * Verbatim copy of the runtime's data binding shape (see plan-types.ts).
 * Duplicated here to avoid importing types-only from a deeper module path
 * across packages.
 */
export interface DataBinding {
  source: string;
  filter?: string;
  sort?: string;
  group_by?: string;
}

/**
 * Resolver signature. Returning `undefined` is meaningful: the component
 * receives `data: undefined` and is expected to render an empty state.
 * Throwing or returning a rejected promise surfaces as `error` on the
 * component's props.
 */
export type DataResolver = (binding: DataBinding) => unknown;

/** Default resolver: returns `undefined` for every binding. */
export const EmptyDataResolver: DataResolver = () => undefined;

/**
 * Provider-scoped resolver context. The provider seeds it; the render
 * walker reads it. Components do NOT consume this context directly — they
 * receive resolved `data`/`loading`/`error` props from the walker.
 */
export const DataResolverContext = createContext<DataResolver>(EmptyDataResolver);
