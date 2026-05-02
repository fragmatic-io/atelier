// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * SWR-style cache wrapper around any `DataResolver`.
 *
 * Goals:
 *   - Hits within `ttlMs` skip the underlying resolver entirely.
 *   - When `staleWhileRevalidate` is true, expired entries are returned
 *     immediately and a background revalidation kicks off.
 *   - If revalidation throws, the cached stale value is preserved.
 *   - When `staleWhileRevalidate` is false, expired entries are simply
 *     dropped and the next call goes through.
 *
 * Mirrors the patterns in `@atelier/runtime/manifest/cache.ts` (TTL +
 * `markStale`-style invalidation), without requiring the manifest cache's
 * heavyweight `ManifestCacheKey` shape.
 *
 * No third-party SWR library is pulled in; everything here is plain JS.
 */

import type { DataBinding, DataResolver } from './types.js';

/** Configuration for {@link withCache}. */
export interface CacheOptions {
  /** Time-to-live in milliseconds. Defaults to 30 seconds. */
  ttlMs?: number;
  /**
   * If true, expired entries are returned immediately while a background
   * revalidation runs. If the revalidation fails, the previous (stale)
   * value is kept. Defaults to `true`.
   */
  staleWhileRevalidate?: boolean;
  /**
   * Custom cache key derivation. By default we serialise the binding
   * canonically (`source|filter|sort|group_by`).
   */
  keyOf?: (binding: DataBinding) => string;
  /** Inject a clock for tests. Defaults to `Date.now`. */
  now?: () => number;
}

interface Entry {
  value: unknown;
  expiresAt: number;
  /** Live revalidation promise, if one is in flight. Used to dedupe concurrent calls. */
  revalidating?: Promise<unknown> | undefined;
}

/** Default cache key: a stable serialisation of the binding shape. */
function defaultKeyOf(binding: DataBinding): string {
  const filter = binding.filter ?? '';
  const sort = binding.sort ?? '';
  const groupBy = binding.group_by ?? '';
  return `${binding.source}|${filter}|${sort}|${groupBy}`;
}

/**
 * The shape returned by {@link withCache}. Implements the `DataResolver`
 * call signature plus a small introspection surface so callers can flush
 * or inspect the cache from tests.
 */
export interface CachedDataResolver {
  (binding: DataBinding): Promise<unknown>;
  /** Drop a single binding's cache entry. Returns true if it existed. */
  invalidate: (binding: DataBinding) => boolean;
  /** Drop every cache entry. Returns the number of entries dropped. */
  clear: () => number;
  /** Number of entries currently held (live or stale). */
  size: () => number;
  /** Test-only: peek at an entry without going through the resolver. */
  peek: (binding: DataBinding) => { value: unknown; expiresAt: number } | undefined;
}

/**
 * Wrap a `DataResolver` with TTL caching and optional stale-while-revalidate.
 *
 * @example
 *   const cached = withCache(restResolver, { ttlMs: 60_000, staleWhileRevalidate: true });
 *   await cached({ source: 'product.list' });
 */
export function withCache(resolver: DataResolver, options: CacheOptions = {}): CachedDataResolver {
  const ttlMs = options.ttlMs ?? 30_000;
  const swr = options.staleWhileRevalidate ?? true;
  const keyOf = options.keyOf ?? defaultKeyOf;
  const now = options.now ?? Date.now;
  const store = new Map<string, Entry>();

  const fetchAndStore = async (key: string, binding: DataBinding): Promise<unknown> => {
    const value = await resolver(binding);
    store.set(key, { value, expiresAt: now() + ttlMs });
    return value;
  };

  const callable = async (binding: DataBinding): Promise<unknown> => {
    const key = keyOf(binding);
    const existing = store.get(key);
    const t = now();

    if (existing && existing.expiresAt > t) {
      // Fresh hit.
      return existing.value;
    }

    if (existing && swr) {
      // Stale hit: kick off background revalidation, return stale value.
      if (!existing.revalidating) {
        existing.revalidating = (async () => {
          try {
            const fresh = await resolver(binding);
            store.set(key, { value: fresh, expiresAt: now() + ttlMs });
            return fresh;
          } catch (err) {
            // Preserve the stale entry on error; bump expiry slightly so we
            // don't hammer a flapping endpoint on every render.
            store.set(key, { value: existing.value, expiresAt: now() + Math.min(ttlMs, 5_000) });
            throw err;
          } finally {
            const e = store.get(key);
            if (e) e.revalidating = undefined;
          }
        })();
        // Swallow background errors — the next call will see the stale value
        // (or the freshly-stored one) and decide what to do.
        existing.revalidating.catch(() => undefined);
      }
      return existing.value;
    }

    // No entry, or stale and SWR disabled — fetch synchronously.
    return fetchAndStore(key, binding);
  };

  return Object.assign(callable, {
    invalidate(binding: DataBinding): boolean {
      return store.delete(keyOf(binding));
    },
    clear(): number {
      const n = store.size;
      store.clear();
      return n;
    },
    size(): number {
      return store.size;
    },
    peek(binding: DataBinding): { value: unknown; expiresAt: number } | undefined {
      const e = store.get(keyOf(binding));
      if (!e) return undefined;
      return { value: e.value, expiresAt: e.expiresAt };
    },
  });
}
