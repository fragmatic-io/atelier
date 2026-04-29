// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * IndexedDB-backed `ManifestCache` for browsers and any runtime that exposes
 * `globalThis.indexedDB`. Uses `idb-keyval`'s `createStore` to namespace into
 * the `cir-manifests` DB.
 *
 * Eviction policy (Phase 4a): bounded count-based LRU. The doc target of
 * 50MB soft / 200MB hard caps (see `/Users/vid/cir/docs/caching.md` §"Local
 * cache strategy") requires a byte-size measurer we have not built yet —
 * deferred to Phase 4c when the persistence story is fully wired. For now,
 * `maxEntries` (default 200) caps the table; oldest `last_used` evicted
 * first.
 *
 * Note: this module imports `idb-keyval` eagerly. Callers running in non-
 * browser environments without `globalThis.indexedDB` (and without
 * `fake-indexeddb` shim) will fail at construction. The MemoryManifestCache
 * is the right alternative for those.
 */

import {
  createStore,
  del as idbDel,
  entries as idbEntries,
  get as idbGet,
  set as idbSet,
  type UseStore,
} from 'idb-keyval';

import {
  deserializeCacheKey,
  serializeCacheKey,
  type CachedManifest,
  type ManifestCache,
  type ManifestCacheKey,
} from './cache.js';

export interface IndexedDBManifestCacheOptions {
  /** Database name. Defaults to `cir-manifests`. */
  dbName?: string;
  /** Object-store name within the DB. Defaults to `manifests`. */
  storeName?: string;
  /** Maximum number of entries before LRU eviction kicks in. Defaults to 200. */
  maxEntries?: number;
  /**
   * Provide an existing `idb-keyval` `UseStore` (e.g. one shared with another
   * subsystem). When omitted, the cache calls `createStore(dbName, storeName)`.
   */
  store?: UseStore;
}

const DEFAULT_DB = 'cir-manifests';
const DEFAULT_STORE = 'manifests';
const DEFAULT_MAX_ENTRIES = 200;

export class IndexedDBManifestCache implements ManifestCache {
  readonly #store: UseStore;
  readonly #maxEntries: number;

  constructor(opts: IndexedDBManifestCacheOptions = {}) {
    this.#maxEntries = Math.max(1, opts.maxEntries ?? DEFAULT_MAX_ENTRIES);
    this.#store =
      opts.store ?? createStore(opts.dbName ?? DEFAULT_DB, opts.storeName ?? DEFAULT_STORE);
  }

  async get(key: ManifestCacheKey): Promise<CachedManifest | null> {
    const value = await idbGet<CachedManifest>(serializeCacheKey(key), this.#store);
    return value ?? null;
  }

  async set(key: ManifestCacheKey, value: CachedManifest): Promise<void> {
    await idbSet(serializeCacheKey(key), value, this.#store);
    await this.#enforceLru();
  }

  async delete(key: ManifestCacheKey): Promise<void> {
    await idbDel(serializeCacheKey(key), this.#store);
  }

  async evictMatching(
    predicate: (key: ManifestCacheKey, value: CachedManifest) => boolean,
  ): Promise<number> {
    const all = await idbEntries<string, CachedManifest>(this.#store);
    let removed = 0;
    for (const [serialized, value] of all) {
      const decoded = deserializeCacheKey(serialized);
      if (!decoded) continue;
      if (predicate(decoded, value)) {
        await idbDel(serialized, this.#store);
        removed += 1;
      }
    }
    return removed;
  }

  async size(): Promise<number> {
    const all = await idbEntries<string, CachedManifest>(this.#store);
    return all.length;
  }

  /**
   * If the store exceeds `maxEntries`, drop entries by oldest `last_used` ISO
   * timestamp until back under the cap. Called after every `set`.
   */
  async #enforceLru(): Promise<void> {
    const all = await idbEntries<string, CachedManifest>(this.#store);
    if (all.length <= this.#maxEntries) return;
    const sorted = [...all].sort(
      ([, a], [, b]) => Date.parse(a.last_used) - Date.parse(b.last_used),
    );
    const overflow = sorted.length - this.#maxEntries;
    for (let i = 0; i < overflow; i += 1) {
      const entry = sorted[i];
      if (!entry) continue;
      await idbDel(entry[0], this.#store);
    }
  }
}
