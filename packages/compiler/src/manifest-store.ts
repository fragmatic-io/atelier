// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tier-3 manifest cache (server-side). Lives in the compiler service's
 * process. Indexed by `(user_id, app_id, route, capability_v, intent_v,
 * skill_hash, brand_kit_v)`. Survives across browser sessions and across
 * users — multiple users of the same app on the same versions share Tier-3
 * cache hits.
 *
 * This is the in-memory implementation. A production deployment would back
 * this with Redis or another shared store; the interface is identical.
 *
 * Eviction: LRU on `last_used` with a configurable max-entries cap (default
 * 10_000 — much larger than the browser cache because the server holds for
 * many users).
 */

import type { Manifest } from '@cir/schemas';

export interface ManifestStoreKey {
  user_id: string;
  app_id: string;
  route: string;
  capability_version?: string | undefined;
  intent_profile_version?: number | undefined;
  skill_set_hash?: string | undefined;
  brand_kit_version?: string | undefined;
}

export interface StoredManifest {
  manifest: Manifest;
  /** Identifier of the compiler that produced this. */
  compiler_id: string;
  /** When it was produced (ISO datetime). */
  compiled_at: string;
  /** Last hit (ISO datetime); updated on get(). */
  last_used: string;
  /** Token cost recorded at compile time. */
  token_cost: number;
  /** Trigger that caused the compile, if any. */
  trigger_chain?: string[] | undefined;
}

export interface ManifestStoreStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  bytes_approx: number;
}

export interface ManifestStore {
  get(key: ManifestStoreKey): Promise<StoredManifest | null>;
  set(key: ManifestStoreKey, value: StoredManifest): Promise<void>;
  delete(key: ManifestStoreKey): Promise<void>;
  evictMatching(
    predicate: (key: ManifestStoreKey, value: StoredManifest) => boolean,
  ): Promise<number>;
  stats(): Promise<ManifestStoreStats>;
  /** Snapshot of every key currently held — used by the debug panel. */
  list(): Promise<Array<{ key: ManifestStoreKey; value: StoredManifest }>>;
}

export interface MemoryManifestStoreOptions {
  /** Max entries before LRU eviction kicks in. Default 10_000. */
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 10_000;

function serializeKey(k: ManifestStoreKey): string {
  return [
    k.user_id,
    k.app_id,
    k.route,
    k.capability_version ?? '*',
    String(k.intent_profile_version ?? 0),
    k.skill_set_hash ?? '*',
    k.brand_kit_version ?? '*',
  ].join('|');
}

function approximateBytes(v: StoredManifest): number {
  try {
    return JSON.stringify(v).length * 2;
  } catch {
    return 0;
  }
}

export class MemoryManifestStore implements ManifestStore {
  readonly #map = new Map<string, { key: ManifestStoreKey; value: StoredManifest }>();
  readonly #maxEntries: number;
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor(opts: MemoryManifestStoreOptions = {}) {
    this.#maxEntries = Math.max(1, opts.maxEntries ?? DEFAULT_MAX_ENTRIES);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async get(key: ManifestStoreKey): Promise<StoredManifest | null> {
    const k = serializeKey(key);
    const entry = this.#map.get(k);
    if (!entry) {
      this.#misses += 1;
      return null;
    }
    entry.value.last_used = new Date().toISOString();
    this.#hits += 1;
    return entry.value;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async set(key: ManifestStoreKey, value: StoredManifest): Promise<void> {
    this.#map.set(serializeKey(key), { key, value });
    this.#enforceLru();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async delete(key: ManifestStoreKey): Promise<void> {
    this.#map.delete(serializeKey(key));
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async evictMatching(
    predicate: (key: ManifestStoreKey, value: StoredManifest) => boolean,
  ): Promise<number> {
    let removed = 0;
    for (const [k, { key, value }] of this.#map) {
      if (predicate(key, value)) {
        this.#map.delete(k);
        removed += 1;
      }
    }
    this.#evictions += removed;
    return removed;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async stats(): Promise<ManifestStoreStats> {
    let bytes = 0;
    for (const { value } of this.#map.values()) {
      bytes += approximateBytes(value);
    }
    return {
      size: this.#map.size,
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions,
      bytes_approx: bytes,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async list(): Promise<Array<{ key: ManifestStoreKey; value: StoredManifest }>> {
    return [...this.#map.values()];
  }

  #enforceLru(): void {
    if (this.#map.size <= this.#maxEntries) return;
    const sorted = [...this.#map.entries()].sort(
      (a, b) => Date.parse(a[1].value.last_used) - Date.parse(b[1].value.last_used),
    );
    const overflow = sorted.length - this.#maxEntries;
    for (let i = 0; i < overflow; i += 1) {
      const entry = sorted[i];
      if (!entry) continue;
      this.#map.delete(entry[0]);
      this.#evictions += 1;
    }
  }
}
