// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `ScopingCache` — keyed memoization of stage-1 results.
 *
 * The two-stage resolver re-uses cached scoping results within a stable
 * `(userId, appId, route, intentHash)` quadruple. Re-scoping happens only
 * when one of those changes — typically when the intent text changes
 * (lens swap, refinement) or the user navigates to a new route. Hits are
 * cheap; misses cost a tiny-model call.
 *
 * The interface is sync-OR-async (mirrors `BudgetCounter`) so a Redis
 * variant can drop in without changing callers. The shipped
 * `MemoryScopingCache` is in-memory and per-process — adequate for MVP
 * single-server deployments and tests; production multi-worker setups
 * should swap in a shared store.
 *
 * Cache entries are immutable refs; the resolver never edits a stored
 * list, only replaces it on miss. TTL is provided as a defensive bound —
 * stale registries should invalidate on capability-version change, but
 * a reasonable wall-clock cap prevents pathological growth in long-lived
 * processes.
 */

import type { CapabilityRef } from './types.js';

/**
 * Composite cache key. We separate the intent hash from the raw intent
 * because intents can be long; the resolver hashes them once and feeds
 * the digest here.
 */
export interface ScopingCacheKey {
  userId: string;
  appId: string;
  route: string;
  /** Stable digest of the intent text. */
  intentHash: string;
}

/**
 * Cached entry. We store the raw refs the stage-1 call returned plus
 * the wall-clock ms when they were stored, so a TTL bound can prune
 * pathological growth without forcing the host to wire invalidation.
 */
export interface ScopingCacheEntry {
  refs: readonly CapabilityRef[];
  storedAt: number;
}

/**
 * The cache contract. All three methods may be sync or async — async
 * implementations (Redis) are unavoidable for production multi-worker
 * setups; in-process variants can stay sync. Callers always `await`.
 */
export interface ScopingCache {
  get(key: ScopingCacheKey): Promise<ScopingCacheEntry | null> | ScopingCacheEntry | null;
  set(key: ScopingCacheKey, entry: ScopingCacheEntry): Promise<void> | void;
  /**
   * Drop everything matching the predicate. The host calls this on
   * capability-version bumps. Return value is the number of entries
   * dropped (useful for audit).
   */
  evictMatching(
    predicate: (key: ScopingCacheKey, entry: ScopingCacheEntry) => boolean,
  ): Promise<number> | number;
}

export interface MemoryScopingCacheOptions {
  /**
   * Max entries before LRU eviction kicks in. Default 1000 — large
   * enough that a single user navigating around an app keeps every
   * route warm, small enough that per-process memory stays bounded.
   */
  maxEntries?: number;
  /**
   * Optional TTL in ms. Entries older than this are treated as misses.
   * Default `undefined` — no TTL, rely on capability-version
   * invalidation. Set to a multiple of the longest expected user
   * session for defensive bounds.
   */
  ttlMs?: number;
  /**
   * Clock seam. Defaults to `Date.now`. Tests inject a mutable counter.
   */
  now?: () => number;
}

const DEFAULT_MAX_ENTRIES = 1000;

function serialize(k: ScopingCacheKey): string {
  return [k.userId, k.appId, k.route, k.intentHash].join('|');
}

/**
 * In-memory `ScopingCache`. LRU on insert / hit (newest entries move to
 * the back of the iteration order). Production multi-worker deployments
 * should swap this for a Redis-backed implementation.
 *
 * Mirrors the shape of `MemoryManifestStore` so hosts get a familiar
 * idiom across the compiler stack.
 */
export class MemoryScopingCache implements ScopingCache {
  readonly #map = new Map<string, { key: ScopingCacheKey; entry: ScopingCacheEntry }>();
  readonly #maxEntries: number;
  readonly #ttlMs: number | undefined;
  readonly #now: () => number;

  constructor(opts: MemoryScopingCacheOptions = {}) {
    this.#maxEntries = Math.max(1, opts.maxEntries ?? DEFAULT_MAX_ENTRIES);
    this.#ttlMs = opts.ttlMs;
    this.#now = opts.now ?? ((): number => Date.now());
  }

  get(key: ScopingCacheKey): ScopingCacheEntry | null {
    const k = serialize(key);
    const hit = this.#map.get(k);
    if (!hit) return null;
    if (this.#ttlMs !== undefined && this.#now() - hit.entry.storedAt > this.#ttlMs) {
      this.#map.delete(k);
      return null;
    }
    // Touch (LRU): re-insert at the back of insertion order.
    this.#map.delete(k);
    this.#map.set(k, hit);
    return hit.entry;
  }

  set(key: ScopingCacheKey, entry: ScopingCacheEntry): void {
    const k = serialize(key);
    if (this.#map.has(k)) this.#map.delete(k);
    this.#map.set(k, { key, entry });
    while (this.#map.size > this.#maxEntries) {
      // The first entry by insertion order is the LRU.
      const oldest = this.#map.keys().next().value;
      if (oldest === undefined) break;
      this.#map.delete(oldest);
    }
  }

  evictMatching(predicate: (key: ScopingCacheKey, entry: ScopingCacheEntry) => boolean): number {
    let dropped = 0;
    for (const [k, v] of this.#map) {
      if (predicate(v.key, v.entry)) {
        this.#map.delete(k);
        dropped += 1;
      }
    }
    return dropped;
  }

  /** Test seam. Production code never calls this. */
  size(): number {
    return this.#map.size;
  }
}

/**
 * Stable, dependency-free hash for intent strings. Not cryptographic;
 * it just needs to give a compact, collision-rare identifier so two
 * identical intents share a cache slot and two distinct intents don't.
 *
 * 32-bit FNV-1a, hex-encoded. ~10ns/intent on modern v8; collision rate
 * is well below noise for any single user's intent surface.
 */
export function hashIntent(intent: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < intent.length; i++) {
    h ^= intent.charCodeAt(i);
    // Multiply by 16777619 mod 2^32. Use Math.imul to avoid loss of
    // precision on the 32-bit boundary.
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned and pad to 8 hex chars.
  return (h >>> 0).toString(16).padStart(8, '0');
}
