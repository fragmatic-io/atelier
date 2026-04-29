// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * IndexedDB-backed `ManifestCache` for browsers and any runtime that exposes
 * `globalThis.indexedDB`. Uses `idb-keyval`'s `createStore` to namespace into
 * the `cir-manifests` DB.
 *
 * Eviction policy (Phase 4d): byte-aware LRU.
 *
 *   - Per-entry size is measured by `JSON.stringify(value).length * 2`
 *     (UTF-16 code units in JS strings); cached on the `CachedManifest` shape
 *     itself in a non-enumerable `__bytes` field so we don't re-serialize on
 *     every eviction pass. The `* 2` is the standard browser approximation
 *     for the in-DB cost.
 *
 *   - `maxBytes` (default 50 * 1024 * 1024 = 50 MiB) is the soft cap from
 *     `docs/caching.md`. On `set`, after writing, if the running byte total
 *     exceeds the cap, oldest `last_used` entries are dropped until back
 *     under it.
 *
 *   - `maxEntries` (default 1000 — wider than Phase 4a's 200 since byte cap
 *     dominates) is a defense-in-depth ceiling against pathological tiny
 *     manifests. Either limit, whichever fires first, evicts.
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
  /**
   * Hard ceiling on entry count. Default 1000. Rarely fires when `maxBytes`
   * is set; here as defense-in-depth.
   */
  maxEntries?: number;
  /**
   * Soft byte cap. Default 50 MiB (52_428_800). Eviction is greedy LRU until
   * the running total drops below the cap. Pass `Infinity` to disable byte
   * accounting entirely (fallback to entry-count-only behavior).
   */
  maxBytes?: number;
  /**
   * Provide an existing `idb-keyval` `UseStore` (e.g. one shared with another
   * subsystem). When omitted, the cache calls `createStore(dbName, storeName)`.
   */
  store?: UseStore;
}

const DEFAULT_DB = 'cir-manifests';
const DEFAULT_STORE = 'manifests';
const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

/** Stored shape: the public CachedManifest plus a private byte hint. */
interface StoredManifest extends CachedManifest {
  __bytes?: number;
}

/**
 * Approximate the in-DB cost of a value. JSON.stringify gives UTF-16 code
 * units; multiply by 2 for the conventional byte estimate that browsers use
 * when reporting quota usage.
 */
export function approximateBytes(value: unknown): number {
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 0;
  }
}

export class IndexedDBManifestCache implements ManifestCache {
  readonly #store: UseStore;
  readonly #maxEntries: number;
  readonly #maxBytes: number;

  constructor(opts: IndexedDBManifestCacheOptions = {}) {
    this.#maxEntries = Math.max(1, opts.maxEntries ?? DEFAULT_MAX_ENTRIES);
    this.#maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    this.#store =
      opts.store ?? createStore(opts.dbName ?? DEFAULT_DB, opts.storeName ?? DEFAULT_STORE);
  }

  async get(key: ManifestCacheKey): Promise<CachedManifest | null> {
    const value = await idbGet<StoredManifest>(serializeCacheKey(key), this.#store);
    if (!value) return null;
    // Strip the private byte hint from the public-facing return.
    const { __bytes: _bytes, ...rest } = value;
    return rest;
  }

  async set(key: ManifestCacheKey, value: CachedManifest): Promise<void> {
    const stored: StoredManifest = {
      ...value,
      __bytes: approximateBytes(value),
    };
    await idbSet(serializeCacheKey(key), stored, this.#store);
    await this.#enforceLru();
  }

  async delete(key: ManifestCacheKey): Promise<void> {
    await idbDel(serializeCacheKey(key), this.#store);
  }

  async evictMatching(
    predicate: (key: ManifestCacheKey, value: CachedManifest) => boolean,
  ): Promise<number> {
    const all = await idbEntries<string, StoredManifest>(this.#store);
    let removed = 0;
    for (const [serialized, value] of all) {
      const decoded = deserializeCacheKey(serialized);
      if (!decoded) continue;
      const { __bytes: _bytes, ...publicValue } = value;
      if (predicate(decoded, publicValue)) {
        await idbDel(serialized, this.#store);
        removed += 1;
      }
    }
    return removed;
  }

  async size(): Promise<number> {
    const all = await idbEntries<string, StoredManifest>(this.#store);
    return all.length;
  }

  /** Total approximate byte usage. Useful for reporting / dashboards. */
  async bytes(): Promise<number> {
    const all = await idbEntries<string, StoredManifest>(this.#store);
    return all.reduce((sum, [, v]) => sum + (v.__bytes ?? approximateBytes(v)), 0);
  }

  /**
   * Greedy LRU eviction. Drops entries oldest-`last_used`-first until BOTH
   * caps are satisfied (entry count AND byte total). Either limit firing
   * triggers eviction. Called after every `set`.
   */
  async #enforceLru(): Promise<void> {
    const all = await idbEntries<string, StoredManifest>(this.#store);
    let totalBytes = all.reduce((sum, [, v]) => sum + (v.__bytes ?? approximateBytes(v)), 0);
    if (all.length <= this.#maxEntries && totalBytes <= this.#maxBytes) return;

    const sorted = [...all].sort(
      ([, a], [, b]) => Date.parse(a.last_used) - Date.parse(b.last_used),
    );
    let count = sorted.length;
    for (const [serialized, value] of sorted) {
      if (count <= this.#maxEntries && totalBytes <= this.#maxBytes) break;
      await idbDel(serialized, this.#store);
      totalBytes -= value.__bytes ?? approximateBytes(value);
      count -= 1;
    }
  }
}
