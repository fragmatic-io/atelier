// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave C / Phase C-3 — high-level resolver shape.
 *
 * The package's lower-level `CapabilityResolver.scope(request, k, registry)`
 * carries the route + user context the production two-stage resolver
 * needs. For simpler callers (tests, ad-hoc tooling, frameworks that just
 * want to ask "give me the top-N for this text"), the package also
 * surfaces a higher-level `HighLevelCapabilityResolver` shape with
 * `resolve(query)` + `index(capabilities)` methods. This file ships:
 *
 *   - `HighLevelCapabilityResolver` — the simple `resolve()`/`index()`
 *     interface.
 *   - `HighLevelQuery` / `HighLevelResult` — the corresponding
 *     query/result types.
 *   - `wrapAsHighLevel(scopeResolver, registry)` — wraps any
 *     scope-based `CapabilityResolver` into the high-level shape, with
 *     the registry bound at wrap time. The `index()` method is a no-op
 *     when the underlying resolver does not have its own indexing
 *     phase (the substring resolver doesn't); resolvers that DO have
 *     an indexing phase (like `EmbeddingCapabilityResolver`) are
 *     expected to expose their own `index()` separately at construction
 *     time — wrapping just bridges `resolve` to `scope`.
 *
 * The high-level shape is also what `CompileInput.capabilityResolver`
 * accepts in `@atelier/compiler`. Hosts can pass either shape — the
 * compiler bridges both.
 */

import type { Capability } from '@atelier/schemas';
import type { CapabilityResolver, ScopeRequest } from './types.js';
import { DEFAULT_SCOPING_K } from './types.js';

/**
 * Query shape for the high-level `resolve()` method. Mirrors
 * `@atelier/compiler`'s `ResolverQuery` so the two packages stay in
 * lockstep.
 */
export interface HighLevelQuery {
  /** Route id being compiled (e.g. "/today"). Optional. */
  routeId?: string;
  /** Free-text query — typically the route's intent surface description. */
  text?: string;
  /** Top-N to return. Defaults to `DEFAULT_SCOPING_K` (30). */
  topN?: number;
  /** Optional abort signal forwarded to the underlying resolver. */
  signal?: AbortSignal;
  /** Optional user/app override (used for cache attribution). */
  userId?: string;
  appId?: string;
}

/**
 * Result shape for the high-level `resolve()` method. Carries both the
 * picked capabilities and an optional debug `scores` channel (parallel
 * array — `scores[i]` corresponds to `capabilities[i]`).
 */
export interface HighLevelResult {
  capabilities: readonly Capability[];
  scores?: readonly number[];
}

/**
 * The high-level resolver contract. `index(capabilities)` is idempotent;
 * resolvers without an indexing phase can leave it as a no-op.
 *
 * `resolve(query)` returns the top-N most relevant capabilities. The
 * order matters — callers feed the first results into the primary
 * compiler in the order returned.
 */
export interface HighLevelCapabilityResolver {
  /** Stable identifier surfaced in audit / logs. */
  readonly id: string;
  /** Pick the top-N most relevant capabilities for a given query. */
  resolve(query: HighLevelQuery): Promise<HighLevelResult>;
  /** Index a corpus of capabilities. Idempotent; no-op for substring. */
  index(capabilities: readonly Capability[]): Promise<void>;
}

/**
 * Bridge any scope-based `CapabilityResolver` into the high-level
 * `resolve()`/`index()` shape. The registry is captured at wrap time
 * so callers don't have to re-pass it on each `resolve` call. The
 * wrapper memoizes the registry as a `Record<string, Capability>` so
 * the underlying resolver's `scope()` call sees the expected shape.
 *
 * `index()` is a no-op when the wrapped resolver doesn't have its own
 * indexing phase (the substring resolver is purely on-demand). For
 * resolvers WITH an indexing phase (like `EmbeddingCapabilityResolver`,
 * which builds a vector index), the indexing call should be wired
 * directly through the resolver's constructor — wrapping merely
 * bridges the `resolve` surface.
 */
export function wrapAsHighLevel(
  scopeResolver: CapabilityResolver,
  initial: readonly Capability[] | Readonly<Record<string, Capability>>,
  options: { defaultRoute?: string; defaultUserId?: string; defaultAppId?: string } = {},
): HighLevelCapabilityResolver {
  let registry: Record<string, Capability> = toRegistry(initial);
  return {
    id: scopeResolver.id,
    // eslint-disable-next-line @typescript-eslint/require-await -- the contract is async; the substring path has nothing to await
    async index(capabilities): Promise<void> {
      registry = toRegistry(capabilities);
    },
    async resolve(query) {
      const k = Math.max(1, query.topN ?? DEFAULT_SCOPING_K);
      const req: ScopeRequest = {
        intent: query.text ?? '',
        route: query.routeId ?? options.defaultRoute ?? '/',
        userId: query.userId ?? options.defaultUserId ?? 'anonymous',
        appId: query.appId ?? options.defaultAppId ?? 'unknown',
        ...(query.signal !== undefined ? { signal: query.signal } : {}),
      };
      const refs = await scopeResolver.scope(req, k, registry);
      const capabilities: Capability[] = [];
      for (const ref of refs) {
        const cap = registry[ref.id];
        if (cap) capabilities.push(cap);
      }
      return { capabilities };
    },
  };
}

function toRegistry(
  src: readonly Capability[] | Readonly<Record<string, Capability>>,
): Record<string, Capability> {
  if (Array.isArray(src)) {
    const out: Record<string, Capability> = {};
    for (const cap of src as readonly Capability[]) {
      out[cap.id] = cap;
    }
    return out;
  }
  return { ...(src as Record<string, Capability>) };
}
