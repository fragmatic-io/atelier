// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `EmbeddingRecipeResolver` — Wave C / Phase C-5. Vector-RAG variant of
 * the substring resolver.
 *
 * Recipes are vector-indexed by their description + domain + intent
 * surfaces; the query (text + domain + intent) is embedded once per call
 * and matched against the index with brute-force cosine similarity.
 * Brand-fit acts as a re-ranking signal over the embedding hits — a
 * recipe that matches the query brand kit gets a small score boost,
 * pushed back in front of equal-similarity competitors.
 *
 * ## Cascade story
 *
 * Mirrors `@atelier/capability-resolver`'s `EmbeddingCapabilityResolver`:
 * embedding-client failures (rate limits, transient transport errors,
 * abort signals) MUST NOT fail the whole compile. The resolver cascades
 * to a configured `fallback` resolver — typically the substring baseline
 * — so the agent's `findRecipe` always returns something sensible. Same
 * fallback is used when the index is empty (cold-start before the first
 * `index(...)` call).
 *
 * Hosts observe failures via the optional `onError` hook (audit /
 * alerting); the cascade itself is automatic.
 *
 * ## What we don't do
 *
 *   - Re-rank by anything more elaborate than brand-fit. Hosts that
 *     want a hybrid lexical+vector ranking can wrap the resolver and
 *     merge with the substring resolver themselves.
 *   - Approximate-NN. Brute force is fast enough at the scales C-5
 *     ships against.
 *   - Cache embeddings cross-call. The index caches the per-recipe
 *     vectors at build time; query vectors are computed fresh per call
 *     (recipe corpora change rarely; user queries change every call).
 */

import { SubstringRecipeResolver } from './substring-resolver.js';
import {
  InMemoryEmbeddingIndex,
  type EmbeddingClient,
  type EmbeddingEntry,
  type EmbeddingIndex,
} from './embedding-index.js';
import type { Recipe, RecipeQuery, RecipeResolver, RecipeResolverResult } from './types.js';
import { DEFAULT_TOP_N } from './types.js';

/**
 * Hook fired when the embedding client throws OR the index is empty. The
 * resolver still cascades; this is purely for audit / alerting.
 * Exceptions thrown here are swallowed.
 */
export type EmbeddingErrorObserver = (event: {
  query: RecipeQuery;
  error: unknown;
  /** True when the failure was "index empty"; false on a client error. */
  emptyIndex: boolean;
}) => void;

/**
 * Hook fired after each successful resolve. Mirrors the capability
 * resolver's observer shape so hosts can wire one observer pipeline
 * across both resolvers.
 */
export type EmbeddingResolveObserver = (event: {
  query: RecipeQuery;
  /** Number of recipes currently in the index. */
  indexSize: number;
  /** Number of recipes returned to the caller. */
  pickedCount: number;
  /** Wall-clock duration of the resolver call in ms. */
  durationMs: number;
}) => void;

/**
 * Cache controlling how recipe-text-to-embedding lookups are stored.
 * The default is a process-local `Map` — it keeps the recipe vectors
 * across `resolve` calls (the index already owns them) and provides a
 * test seam for asserting cache hits.
 */
export interface EmbeddingResolverCache {
  get(key: string): readonly number[] | undefined;
  set(key: string, vector: readonly number[]): void;
  clear(): void;
}

/**
 * Default in-memory `Map`-backed cache. Bounded by `maxEntries` (LRU-on-
 * read isn't worth the complexity at this corpus size; we just trim
 * oldest insertions).
 */
export class MemoryEmbeddingResolverCache implements EmbeddingResolverCache {
  readonly #map = new Map<string, readonly number[]>();
  readonly #max: number;

  constructor(opts: { maxEntries?: number } = {}) {
    this.#max = Math.max(1, opts.maxEntries ?? 1024);
  }

  get(key: string): readonly number[] | undefined {
    return this.#map.get(key);
  }

  set(key: string, vector: readonly number[]): void {
    if (this.#map.size >= this.#max) {
      const oldest = this.#map.keys().next().value;
      if (oldest !== undefined) this.#map.delete(oldest);
    }
    this.#map.set(key, vector);
  }

  clear(): void {
    this.#map.clear();
  }

  size(): number {
    return this.#map.size;
  }
}

export interface EmbeddingRecipeResolverOptions {
  /** Embedding client used at build + query time. */
  client: EmbeddingClient;
  /**
   * Optional pre-built index. Defaults to a fresh `InMemoryEmbeddingIndex`.
   * Hosts swap this for an HNSW / IVF index past ~10k recipes without
   * touching the resolver.
   */
  index?: EmbeddingIndex;
  /**
   * Fallback resolver used when the embedding client errors OR the
   * index is empty (cold start). Defaults to a fresh
   * `SubstringRecipeResolver`. The fallback is `index(...)`-ed alongside
   * the embedding index so the cascade returns useful results.
   */
  fallback?: RecipeResolver;
  /** Override the resolver `id`. Defaults to `'embedding[<client.id>]'`. */
  id?: string;
  /** Optional query-vector cache. Defaults to a `MemoryEmbeddingResolverCache`. */
  cache?: EmbeddingResolverCache;
  /** Brand-fit score nudge added to embedding cosine when brand matches. */
  brandFitBonus?: number;
  /** Observer fired on success. */
  onResolve?: EmbeddingResolveObserver;
  /** Observer fired when the resolver cascades to its fallback. */
  onError?: EmbeddingErrorObserver;
  /** Optional clock seam. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Pack a recipe into the string the embedding model sees. Concatenate
 * description + domain + intent surfaces so a single embedding captures
 * "what is this for + what surfaces does it cover". We deliberately
 * exclude `brand_kit_id` from the embedding text — brand-fit is a
 * structured signal we apply as re-ranking, not a free-text token the
 * embedding should be sensitive to.
 */
export function recipeEmbeddingText(recipe: Recipe): string {
  const parts: string[] = [`${recipe.id}: ${recipe.description}`];
  if (recipe.domain) parts.push(`domain: ${recipe.domain}`);
  if (recipe.intent_surfaces && recipe.intent_surfaces.length > 0) {
    parts.push(`surfaces: ${recipe.intent_surfaces.join(', ')}`);
  }
  return parts.join('\n');
}

/**
 * Pack a query into the string the embedding model sees. Concatenate
 * the free-text + domain + any intent profile signals + route. Same
 * shape as `recipeEmbeddingText` (modulo the recipe-specific id
 * prefix) so query / corpus vectors land in the same semantic space.
 */
export function queryEmbeddingText(query: RecipeQuery): string {
  const parts: string[] = [];
  if (query.text) parts.push(query.text);
  if (query.domain) parts.push(`domain: ${query.domain}`);
  if (query.routeId) parts.push(`route: ${query.routeId}`);
  // The IntentProfile carries opaque preferences; we surface only its
  // 'profile_id' (a stable handle) and any 'global_preferences.density'
  // hint that often correlates with persona. Hosts that want a richer
  // signal can render their own query text upstream and pass it as
  // `query.text`.
  if (query.intent) {
    const profileId = (query.intent as { profile_id?: string }).profile_id;
    if (typeof profileId === 'string' && profileId.length > 0) {
      parts.push(`persona: ${profileId}`);
    }
  }
  return parts.join('\n');
}

export class EmbeddingRecipeResolver implements RecipeResolver {
  readonly id: string;
  readonly #client: EmbeddingClient;
  readonly #index: EmbeddingIndex;
  readonly #fallback: RecipeResolver;
  readonly #cache: EmbeddingResolverCache;
  readonly #brandFitBonus: number;
  readonly #onResolve: EmbeddingResolveObserver | undefined;
  readonly #onError: EmbeddingErrorObserver | undefined;
  readonly #now: () => number;
  #recipesById = new Map<string, Recipe>();

  constructor(opts: EmbeddingRecipeResolverOptions) {
    this.#client = opts.client;
    this.#index = opts.index ?? new InMemoryEmbeddingIndex();
    this.#fallback = opts.fallback ?? new SubstringRecipeResolver();
    this.#cache = opts.cache ?? new MemoryEmbeddingResolverCache();
    this.#brandFitBonus = opts.brandFitBonus ?? 0.05;
    this.#onResolve = opts.onResolve;
    this.#onError = opts.onError;
    this.#now = opts.now ?? ((): number => Date.now());
    this.id = opts.id ?? `embedding[${opts.client.id}]`;
  }

  async index(recipes: readonly Recipe[]): Promise<void> {
    // Always seed the fallback too — when we cascade we want it to
    // return useful results.
    await this.#fallback.index(recipes);

    this.#recipesById = new Map(recipes.map((r) => [r.id, r]));
    this.#cache.clear();
    const entries: EmbeddingEntry[] = recipes.map((r) => ({
      id: r.id,
      text: recipeEmbeddingText(r),
    }));
    await this.#index.build(entries, this.#client);
  }

  async resolve(query: RecipeQuery): Promise<RecipeResolverResult> {
    const topN = query.topN ?? DEFAULT_TOP_N;
    if (topN <= 0) return { recipes: [], scores: [] };

    const startedAt = this.#now();

    // Cold-start guard.
    if (this.#index.size() === 0) {
      this.#fireOnError({
        query,
        error: new Error('EmbeddingRecipeResolver: index is empty'),
        emptyIndex: true,
      });
      return this.#fallback.resolve(query);
    }

    const queryText = queryEmbeddingText(query);
    if (queryText.trim().length === 0) {
      // No signal to embed — cascade to fallback. The substring resolver
      // returns `[]` for an empty query too, but we still go through it
      // so hosts that ship a custom fallback (e.g. always-return-default)
      // get a chance.
      return this.#fallback.resolve(query);
    }

    let queryVector: readonly number[];
    const cached = this.#cache.get(queryText);
    if (cached !== undefined) {
      queryVector = cached;
    } else {
      try {
        queryVector = await this.#client.embed(queryText);
      } catch (err) {
        this.#fireOnError({ query, error: err, emptyIndex: false });
        return this.#fallback.resolve(query);
      }
      this.#cache.set(queryText, queryVector);
    }

    const overFetch = Math.max(topN, Math.min(topN * 2, this.#index.size()));
    const hits = this.#index.topK(queryVector, overFetch);

    type Scored = { recipe: Recipe; score: number; idx: number };
    const scored: Scored[] = [];
    let idx = 0;
    for (const hit of hits) {
      const recipe = this.#recipesById.get(hit.id);
      if (!recipe) continue;
      let score = hit.score;
      if (
        query.brandKitId !== undefined &&
        recipe.brand_kit_id !== undefined &&
        recipe.brand_kit_id === query.brandKitId
      ) {
        score += this.#brandFitBonus;
      }
      scored.push({ recipe, score, idx });
      idx += 1;
    }

    if (scored.length === 0) {
      this.#fireOnError({
        query,
        error: new Error(
          `EmbeddingRecipeResolver: ${String(hits.length)} hit(s) but none matched the indexed recipes`,
        ),
        emptyIndex: false,
      });
      return this.#fallback.resolve(query);
    }

    // Re-sort after brand-fit nudge; ties broken by original retrieval
    // order (`idx`).
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const top = scored.slice(0, topN);

    this.#fireOnResolve({
      query,
      indexSize: this.#index.size(),
      pickedCount: top.length,
      durationMs: this.#now() - startedAt,
    });

    return {
      recipes: top.map((s) => s.recipe),
      scores: top.map((s) => s.score),
    };
  }

  #fireOnResolve(event: Parameters<EmbeddingResolveObserver>[0]): void {
    if (!this.#onResolve) return;
    try {
      this.#onResolve(event);
    } catch {
      // A misbehaving subscriber must not poison the resolve path.
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
