// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * In-memory implementation of `ManifestCache`. Backed by a plain `Map` keyed
 * by the serialized cache key string. No persistence; cleared on process
 * exit. Intended for tests, dev, and SSR contexts where IndexedDB is absent.
 */

import {
  deserializeCacheKey,
  serializeCacheKey,
  type CachedManifest,
  type ManifestCache,
  type ManifestCacheKey,
} from './cache.js';

/* eslint-disable @typescript-eslint/require-await -- Methods are sync but
   the `ManifestCache` interface is async; we satisfy the interface contract
   uniformly across Memory + IndexedDB implementations. */
export class MemoryManifestCache implements ManifestCache {
  readonly #store = new Map<string, CachedManifest>();

  async get(key: ManifestCacheKey): Promise<CachedManifest | null> {
    return this.#store.get(serializeCacheKey(key)) ?? null;
  }

  async set(key: ManifestCacheKey, value: CachedManifest): Promise<void> {
    this.#store.set(serializeCacheKey(key), value);
  }

  async delete(key: ManifestCacheKey): Promise<void> {
    this.#store.delete(serializeCacheKey(key));
  }

  async evictMatching(
    predicate: (key: ManifestCacheKey, value: CachedManifest) => boolean,
  ): Promise<number> {
    let removed = 0;
    for (const [serialized, value] of this.#store) {
      const key = deserializeCacheKey(serialized);
      if (!key) continue;
      if (predicate(key, value)) {
        this.#store.delete(serialized);
        removed += 1;
      }
    }
    return removed;
  }

  async markStale(
    predicate: (key: ManifestCacheKey, value: CachedManifest) => boolean,
  ): Promise<number> {
    let marked = 0;
    for (const [serialized, value] of this.#store) {
      const key = deserializeCacheKey(serialized);
      if (!key) continue;
      if (predicate(key, value)) {
        this.#store.set(serialized, { ...value, stale: true });
        marked += 1;
      }
    }
    return marked;
  }

  async size(): Promise<number> {
    return this.#store.size;
  }

  /**
   * Test-only escape hatch. Returns a snapshot of the entries currently held.
   * Not part of the `ManifestCache` interface; consumers reaching for this
   * outside tests are doing something wrong.
   */
  entriesForTest(): ReadonlyMap<string, CachedManifest> {
    return new Map(this.#store);
  }
}
