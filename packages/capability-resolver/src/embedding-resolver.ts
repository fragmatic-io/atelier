// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `EmbeddingCapabilityResolver` — Wave 10 / S-7. RAG variant of S-1.
 *
 * Capability scoping via precomputed dense vector embeddings + cosine
 * similarity. The `TwoStageCapabilityResolver` (S-1) uses a tiny LLM
 * call per scope to pick the top-K capabilities; this S-7 variant
 * embeds the query once and runs an in-memory cosine search against a
 * pre-built `EmbeddingIndex`.
 *
 * ## When to use which
 *
 *   - S-1 (`TwoStageCapabilityResolver`) — production default for
 *     registries up to ~1000 capabilities. The tiny model has enough
 *     context to reason over the full registry; the per-scope LLM
 *     latency (~200ms) is the dominant cost.
 *   - S-7 (this resolver) — registries past ~1000 capabilities. Vector
 *     search is sub-millisecond; the LLM-pick approach starts dropping
 *     accuracy past that scale because the tiny model can't reliably
 *     skim a long flat summary list. Build cost is one-time per
 *     registry version (re-embed only on schema change), not per-scope.
 *
 * Both resolvers implement the same `CapabilityResolver` seam, so hosts
 * swap implementations without touching `ToolUsingCompiler` or the
 * `semanticSearchFromResolver` adapter.
 *
 * ## Cascade story
 *
 * Mirrors `TwoStageCapabilityResolver`: embedding-client failures (rate
 * limits, transient transport errors, abort signals) MUST NOT fail the
 * whole compile. The resolver cascades to a configured `fallback`
 * resolver — typically the substring baseline — so the agent's
 * `findCapability` always returns something sensible. Same fallback is
 * used when the index is empty (cold-start before the first build).
 *
 * Hosts observe failures via the optional `onError` hook (audit /
 * alerting); the cascade itself is automatic.
 *
 * ## Dependency avoidance
 *
 * No hard dep on a specific embedding provider. `EmbeddingClient` is
 * the seam — hosts plug in OpenAI / Cohere / Gemini / local sentence
 * transformers. Same idiom as `ScopingLlmClient` in S-1.
 */

import type { Capability } from '@atelier/schemas';
import { SubstringCapabilityResolver } from './substring-resolver.js';
import type { EmbeddingClient, EmbeddingIndex } from './embedding-index.js';
import type { CapabilityRef, CapabilityResolver, ScopeRequest } from './types.js';

/**
 * Hook fired when the embedding client throws OR the index is empty.
 * The resolver still cascades; this is purely for audit / alerting.
 * Exceptions thrown here are swallowed (consistent with the other
 * observer hooks in this package).
 */
export type EmbeddingErrorObserver = (event: {
  intent: string;
  route: string;
  error: unknown;
  /** True when the failure was "index empty"; false on a client error. */
  emptyIndex: boolean;
}) => void;

/**
 * Hook fired after each successful scope. Mirrors S-1's `ScopingObserver`
 * shape so hosts can wire one observer pipeline across both resolvers.
 */
export type EmbeddingScopeObserver = (event: {
  intent: string;
  route: string;
  /** Number of capabilities currently in the index. */
  indexSize: number;
  /** Number of refs returned to the caller. */
  pickedCount: number;
  /** Wall-clock duration of the resolver call in ms. */
  durationMs: number;
}) => void;

export interface EmbeddingCapabilityResolverOptions {
  /** Pre-built embedding index. Hosts call `index.build(...)` at boot. */
  index: EmbeddingIndex;
  /** Embedding client used to embed the query string at scope time. */
  client: EmbeddingClient;
  /**
   * Fallback resolver used when the embedding client errors OR the
   * index is empty (cold start). Defaults to a fresh
   * `SubstringCapabilityResolver`.
   */
  fallback?: CapabilityResolver;
  /**
   * Override the resolver `id`. Defaults to `'embedding[<client.id>]'`.
   */
  id?: string;
  /** Observer fired on success. */
  onScope?: EmbeddingScopeObserver;
  /** Observer fired when the resolver cascades to its fallback. */
  onError?: EmbeddingErrorObserver;
  /**
   * Optional clock seam. Defaults to `Date.now`. Used for the
   * `durationMs` reported to `onScope`.
   */
  now?: () => number;
}

export class EmbeddingCapabilityResolver implements CapabilityResolver {
  readonly id: string;
  readonly #index: EmbeddingIndex;
  readonly #client: EmbeddingClient;
  readonly #fallback: CapabilityResolver;
  readonly #onScope: EmbeddingScopeObserver | undefined;
  readonly #onError: EmbeddingErrorObserver | undefined;
  readonly #now: () => number;

  constructor(opts: EmbeddingCapabilityResolverOptions) {
    this.#index = opts.index;
    this.#client = opts.client;
    this.#fallback = opts.fallback ?? new SubstringCapabilityResolver();
    this.#onScope = opts.onScope;
    this.#onError = opts.onError;
    this.#now = opts.now ?? ((): number => Date.now());
    this.id = opts.id ?? `embedding[${opts.client.id}]`;
  }

  async scope(
    request: ScopeRequest,
    k: number,
    registry: Readonly<Record<string, Capability>>,
  ): Promise<readonly CapabilityRef[]> {
    if (k <= 0 || !request.intent) return [];

    const startedAt = this.#now();

    // Cold-start guard: nothing to search against. Cascade.
    if (this.#index.size() === 0) {
      this.#fireOnError({
        intent: request.intent,
        route: request.route,
        error: new Error('EmbeddingCapabilityResolver: index is empty'),
        emptyIndex: true,
      });
      return this.#fallback.scope(request, k, registry);
    }

    // Embed the query. Provider failures cascade.
    let queryVector: readonly number[];
    try {
      queryVector = await this.#client.embed(request.intent);
    } catch (err) {
      this.#fireOnError({
        intent: request.intent,
        route: request.route,
        error: err,
        emptyIndex: false,
      });
      return this.#fallback.scope(request, k, registry);
    }

    // Vector search. We over-fetch by a small factor in case some hits
    // reference capabilities no longer in the live registry (hot
    // registry mutation between build and scope); after filtering we
    // still want at least `k` results when available.
    const overFetch = Math.max(k, Math.min(k * 2, this.#index.size()));
    const hits = this.#index.topK(queryVector, overFetch);

    const refs: CapabilityRef[] = [];
    const seen = new Set<string>();
    for (const hit of hits) {
      if (refs.length >= k) break;
      if (seen.has(hit.id)) continue;
      const cap = registry[hit.id];
      if (!cap) continue; // dropped from registry since build
      seen.add(hit.id);
      const desc = (cap as { description?: string }).description;
      refs.push(
        typeof desc === 'string' && desc.length > 0
          ? { id: hit.id, description: desc }
          : { id: hit.id },
      );
    }

    // If the index produced ZERO usable refs (every hit was a stale id),
    // cascade rather than starve the agent. This is the embedding-side
    // equivalent of S-1's "model returned only invented ids" branch.
    if (refs.length === 0) {
      this.#fireOnError({
        intent: request.intent,
        route: request.route,
        error: new Error(
          `EmbeddingCapabilityResolver: ${String(hits.length)} hit(s) but none matched the registry`,
        ),
        emptyIndex: false,
      });
      return this.#fallback.scope(request, k, registry);
    }

    this.#fireOnScope({
      intent: request.intent,
      route: request.route,
      indexSize: this.#index.size(),
      pickedCount: refs.length,
      durationMs: this.#now() - startedAt,
    });
    return refs;
  }

  #fireOnScope(event: Parameters<EmbeddingScopeObserver>[0]): void {
    if (!this.#onScope) return;
    try {
      this.#onScope(event);
    } catch {
      // A misbehaving subscriber must not poison the compile path.
    }
  }

  #fireOnError(event: Parameters<EmbeddingErrorObserver>[0]): void {
    if (!this.#onError) return;
    try {
      this.#onError(event);
    } catch {
      // ditto
    }
  }
}
