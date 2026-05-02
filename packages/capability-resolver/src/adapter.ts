// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `semanticSearchFromResolver` — bridge from a `CapabilityResolver` to
 * `@atelier/compiler`'s `SemanticSearch` seam, so the C-2 `ToolUsingCompiler`
 * can consume a scoping resolver without modification.
 *
 * The compiler calls `search.capabilities(query, k)` synchronously when
 * the agent invokes `findCapability(intent, k?)`. The C-2 surface is
 * synchronous because every other tool dispatch is sync; `SemanticSearch`
 * was deliberately typed sync so the whole tool surface stays uniform.
 *
 * `CapabilityResolver.scope` is async (the production variant calls a
 * tiny model). To bridge the impedance gap WITHOUT changing C-2, the
 * adapter takes a `registry` reference and a "warm-cache" entrypoint:
 *
 *   - The host (or the resolver itself) populates a stage-1 cache.
 *   - The C-2 `findCapability(query, k)` call hits the cache and gets
 *     refs synchronously.
 *
 * For the MVP we ship two integration shapes:
 *
 *   1. **`semanticSearchFromResolver(resolver, registry, options)`** —
 *      the simple shape. Maintains a request-scoped sync mirror of the
 *      last resolver result for the active query. Hosts call
 *      `prime(query, k)` once per compile to populate the mirror; the
 *      compiler then reads the mirror. Useful when the host knows the
 *      compile's intent before kicking the agent loop.
 *
 *   2. **`semanticSearchFromResolverDirect(resolver, registry, request)`**
 *      — the bound-context shape. Caller closes over the `ScopeRequest`
 *      (user/app/route) and the registry, returning a `SemanticSearch`
 *      whose `capabilities(query, k)` triggers a *blocking* in-memory
 *      cache lookup against the resolver's cache. Useful when the
 *      resolver has been pre-warmed elsewhere in the request pipeline.
 *
 * Both shapes degrade gracefully: when the cache is cold, the adapter
 * returns `[]`, which falls through to the `ToolUsingCompiler`'s own
 * substring fallback (see `tool-environment.ts:fallbackFindCapability`).
 * The agent never sees an exception.
 */

import type { Capability } from '@atelier/schemas';
import type { SemanticSearch, CapabilityRef } from '@atelier/compiler';
import { DEFAULT_SCOPING_K, type CapabilityResolver, type ScopeRequest } from './types.js';

/**
 * Options for `semanticSearchFromResolver`. Hosts that want to react to
 * stage-1 errors (audit, fall-through alerting) supply `onError`; the
 * adapter still returns `[]` so the agent's substring fallback runs.
 */
export interface SemanticSearchFromResolverOptions {
  /** Default K when the agent doesn't pass one. Defaults to `DEFAULT_SCOPING_K`. */
  defaultK?: number;
  /** Bound `ScopeRequest`. Required — carries user/app/route. */
  request: ScopeRequest;
  /** Capability registry. Required — passed to `resolver.scope`. */
  registry: Readonly<Record<string, Capability>>;
  /**
   * Optional error sink for stage-1 cascades. Exceptions thrown here
   * are swallowed (consistent with other adapter hooks).
   */
  onError?: (err: unknown) => void;
}

/**
 * Wrap `resolver` so the request-scoped result is observable through
 * `@atelier/compiler`'s `SemanticSearch.capabilities(query, k)` seam.
 *
 * The returned object exposes:
 *
 *   - `prime(query, k?)` — async; calls `resolver.scope` and stores the
 *     result. Hosts call this once before dispatching the compile.
 *   - `search` — the `SemanticSearch` to pass to `ToolUsingCompiler`.
 *     Reads the most recently primed result; returns `[]` if the agent
 *     queries before priming.
 *   - `lastQuery` / `lastRefs` — observable for tests and diagnostics.
 *
 * This shape keeps the resolver async (good) AND the C-2 tool surface
 * sync (good) without forcing a Promise into the compiler's hot path.
 */
export interface PrimedSemanticSearch {
  /** Run stage-1 once for `(query, k)`. Caches the refs. */
  prime(query: string, k?: number): Promise<readonly CapabilityRef[]>;
  /** The SemanticSearch object handed to ToolUsingCompiler. */
  readonly search: SemanticSearch;
  /** The query string most recently passed to `prime()`. */
  readonly lastQuery: string | null;
  /** Refs from the most recent `prime()` call. */
  readonly lastRefs: readonly CapabilityRef[];
}

export function semanticSearchFromResolver(
  resolver: CapabilityResolver,
  options: SemanticSearchFromResolverOptions,
): PrimedSemanticSearch {
  const defaultK = Math.max(1, options.defaultK ?? DEFAULT_SCOPING_K);
  let lastQuery: string | null = null;
  let lastRefs: readonly CapabilityRef[] = [];

  const search: SemanticSearch = {
    capabilities: (query: string, k: number) => {
      // Sync read against the most recent prime. The pre-scoped set
      // IS the candidate list for this compile — the agent's per-call
      // `findCapability(query)` filters within the 30 ids the stage-1
      // resolver picked, never against the full registry.
      //
      // We do a lightweight in-memory substring filter on the pre-scoped
      // set when the agent's query differs from the priming intent. If
      // nothing matches, we return the full pre-scoped list rather than
      // `[]` so the agent always sees something useful (the substring
      // fallback in `ToolUsingCompiler` runs against the FULL registry,
      // which would defeat the whole point of scoping).
      if (lastRefs.length === 0) return [];
      const k_clamped = Math.max(0, k);
      if (k_clamped === 0) return [];
      if (lastQuery === query || query.length === 0) {
        return lastRefs.slice(0, k_clamped);
      }
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 2);
      if (terms.length === 0) return lastRefs.slice(0, k_clamped);
      const filtered = lastRefs.filter((ref) => {
        const id = ref.id.toLowerCase();
        const desc = (ref.description ?? '').toLowerCase();
        return terms.some((t) => id.includes(t) || desc.includes(t));
      });
      const result = filtered.length > 0 ? filtered : lastRefs;
      return result.slice(0, k_clamped);
    },
  };

  return {
    search,
    get lastQuery() {
      return lastQuery;
    },
    get lastRefs() {
      return lastRefs;
    },
    async prime(query: string, k?: number): Promise<readonly CapabilityRef[]> {
      const effectiveK = Math.max(1, k ?? defaultK);
      const req: ScopeRequest = { ...options.request, intent: query };
      try {
        const refs = await resolver.scope(req, effectiveK, options.registry);
        lastQuery = query;
        lastRefs = refs;
        return refs;
      } catch (err) {
        if (options.onError) {
          try {
            options.onError(err);
          } catch {
            // ignore
          }
        }
        lastQuery = query;
        lastRefs = [];
        return [];
      }
    },
  };
}

/**
 * "Direct" variant — the resolver runs synchronously off a pre-warmed
 * `lookup` callback. Hosts that have already populated a stage-1 cache
 * elsewhere in the request pipeline (e.g. on the route handler before
 * the compile fires) wire `lookup` to read from that cache.
 *
 * `lookup(query, k)` MUST be sync. If it returns `null`, the C-2
 * substring fallback runs.
 */
export function semanticSearchFromLookup(
  lookup: (query: string, k: number) => readonly CapabilityRef[] | null,
): SemanticSearch {
  return {
    capabilities: (query: string, k: number) => {
      const refs = lookup(query, k);
      return refs ?? [];
    },
  };
}
