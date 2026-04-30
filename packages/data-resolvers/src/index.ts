// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `@cir/data-resolvers` — drop-in adapters that satisfy the `DataResolver`
 * protocol from `@cir/react`.
 *
 * Without these adapters every host had to hand-roll a fetch layer to
 * resolve manifest data bindings; the runtime shipped only an
 * `EmptyDataResolver` sentinel so unwired apps fell back to empty UI.
 * This package provides reusable building blocks:
 *
 *   - {@link RestDataResolver}     — generic HTTP fetch with optional URL
 *                                     templates and auth headers.
 *   - {@link OpenApiDataResolver}  — auto-wires capabilities imported via
 *                                     `cir import openapi`.
 *   - {@link GraphQLDataResolver}  — single-endpoint adapter with an
 *                                     auto-built query.
 *   - {@link MockDataResolver}     — fixture-driven, supports filter / sort
 *                                     / group_by client-side.
 *   - {@link CompositeDataResolver}— falls through a list of resolvers.
 *   - {@link withCache}            — TTL + stale-while-revalidate wrapper.
 *
 * The `DataResolver` interface in `@cir/react` is intentionally NOT
 * imported here: this package stays React-agnostic so server-side
 * resolvers can use it without bringing in a UI framework. Each adapter
 * exposes a `resolve` method that satisfies the protocol's call signature
 * — bind it as `dataResolver={resolver.resolve}` when wiring `<CirRuntime>`.
 */

export { RestDataResolver, buildRestUrl } from './rest.js';
export type { RestResolverOptions, HeaderProvider } from './rest.js';
export { OpenApiDataResolver, findOperation, specRefFromImportedFrom } from './openapi.js';
export type { OpenApiResolverOptions, SpecLoader } from './openapi.js';
export { GraphQLDataResolver, defaultFieldName } from './graphql.js';
export type { GraphQLResolverOptions } from './graphql.js';
export { MockDataResolver } from './mock.js';
export type { MockResolverOptions, FixtureValue } from './mock.js';
export { CompositeDataResolver } from './composite.js';
export type { CompositeResolverOptions } from './composite.js';
export { withCache } from './cache.js';
export type { CacheOptions, CachedDataResolver } from './cache.js';
export {
  parseFilter,
  tryParseFilter,
  astToString,
  toQueryString,
  toWhereClause,
  toPredicate,
} from './filter-parser.js';
export type {
  FilterAst,
  ComparisonNode,
  LogicalNode,
  ComparisonOp,
  LogicalOp,
  LiteralValue,
} from './filter-parser.js';
export type { DataBinding, DataResolver, CapabilityLookup } from './types.js';
export { lookupCapability } from './types.js';
