// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Redis-backed Tier-3 manifest cache. Drop-in replacement for
 * `MemoryManifestStore` for production / multi-instance deployments where the
 * compiler service is horizontally scaled and Tier-3 hits must survive process
 * restarts.
 *
 * The store is intentionally agnostic of the redis client lifecycle: callers
 * pass in a pre-built (and pre-connected) `node-redis` v5 client and own the
 * `connect()` / `quit()` calls. This keeps tests simple and lets apps share
 * one redis client across stores (manifest cache + rate limiters + sessions).
 *
 * Key shape: `${keyPrefix}${serializedKey}` where the serialized key is the
 * same `(user_id|app_id|route|capability_v|intent_v|skill_hash|brand_kit_v)`
 * pipe-joined string `MemoryManifestStore` uses — so a deployment can swap
 * stores without rebuilding URLs.
 *
 * Eviction: trigger-driven (via `evictMatching`) is primary. A soft TTL is
 * also applied per entry as a safety net in case a process dies mid-eviction
 * or a key escapes the trigger graph. Default 7 days; pass `0` to disable.
 *
 * Stats: `hits` / `misses` / `evictions` are tracked in INSTANCE-LOCAL
 * counters — they reflect what THIS process has seen, not the whole cluster.
 * Cluster-wide observability is a separate concern (see
 * `docs/production-concerns.md` "Observability").
 */

import type { RedisClientType } from 'redis';
import type {
  ManifestStore,
  ManifestStoreKey,
  ManifestStoreStats,
  StoredManifest,
} from './manifest-store.js';

export interface RedisManifestStoreOptions {
  /** Pre-built node-redis client. Caller owns the lifecycle (connect/quit). */
  client: RedisClientType;
  /** Key prefix in Redis. Default: 'cir:manifest:'. */
  keyPrefix?: string;
  /**
   * TTL per entry in seconds. 0 = no TTL. Default 604_800 (7 days).
   * Acts as a soft cap; trigger-driven eviction is still primary.
   */
  ttlSeconds?: number;
}

const DEFAULT_KEY_PREFIX = 'cir:manifest:';
const DEFAULT_TTL_SECONDS = 604_800; // 7 days
const SCAN_BATCH = 200;

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

function deserializeKey(s: string): ManifestStoreKey | null {
  const parts = s.split('|');
  if (parts.length !== 7) return null;
  const [
    user_id,
    app_id,
    route,
    capability_version,
    intent_profile_version,
    skill_set_hash,
    brand_kit_version,
  ] = parts as [string, string, string, string, string, string, string];
  const intentNum = Number(intent_profile_version);
  return {
    user_id,
    app_id,
    route,
    capability_version: capability_version === '*' ? undefined : capability_version,
    intent_profile_version: Number.isFinite(intentNum) && intentNum > 0 ? intentNum : undefined,
    skill_set_hash: skill_set_hash === '*' ? undefined : skill_set_hash,
    brand_kit_version: brand_kit_version === '*' ? undefined : brand_kit_version,
  };
}

/**
 * Minimal slice of node-redis v5's `RedisClientType` that this store calls.
 * Declared as a structural interface so test fakes can satisfy it without
 * pulling in the full client type tree.
 *
 * The store accepts the wider `RedisClientType` at the public boundary — this
 * narrower shape is purely an internal contract used during dispatch.
 */
interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string | string[]): Promise<number>;
  scanIterator(options?: {
    MATCH?: string;
    COUNT?: number;
  }): AsyncIterable<string[]> | AsyncIterable<string>;
  dbSize(): Promise<number>;
}

export class RedisManifestStore implements ManifestStore {
  readonly #client: RedisClientLike;
  readonly #keyPrefix: string;
  readonly #ttlSeconds: number;
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor(opts: RedisManifestStoreOptions) {
    this.#client = opts.client;
    this.#keyPrefix = opts.keyPrefix ?? DEFAULT_KEY_PREFIX;
    const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.#ttlSeconds = ttl < 0 ? 0 : Math.floor(ttl);
  }

  async get(key: ManifestStoreKey): Promise<StoredManifest | null> {
    const redisKey = this.#redisKey(key);
    const raw = await this.#client.get(redisKey);
    if (raw == null) {
      this.#misses += 1;
      return null;
    }
    let parsed: StoredManifest;
    try {
      parsed = JSON.parse(raw) as StoredManifest;
    } catch {
      // Corrupt entry — treat as miss and remove it so we don't trip again.
      this.#misses += 1;
      await this.#client.del(redisKey).catch(() => 0);
      return null;
    }
    parsed.last_used = new Date().toISOString();
    this.#hits += 1;
    // Refresh the entry (and its TTL). Failure to write back is non-fatal —
    // the next `get` will simply observe a slightly stale `last_used`.
    await this.#writeRaw(redisKey, parsed).catch(() => undefined);
    return parsed;
  }

  async set(key: ManifestStoreKey, value: StoredManifest): Promise<void> {
    await this.#writeRaw(this.#redisKey(key), value);
  }

  async delete(key: ManifestStoreKey): Promise<void> {
    await this.#client.del(this.#redisKey(key));
  }

  async evictMatching(
    predicate: (key: ManifestStoreKey, value: StoredManifest) => boolean,
  ): Promise<number> {
    const toDelete: string[] = [];
    for await (const batch of this.#scanKeys()) {
      for (const redisKey of batch) {
        const raw = await this.#client.get(redisKey);
        if (raw == null) continue;
        let value: StoredManifest;
        try {
          value = JSON.parse(raw) as StoredManifest;
        } catch {
          continue;
        }
        const decoded = deserializeKey(redisKey.slice(this.#keyPrefix.length));
        if (!decoded) continue;
        if (predicate(decoded, value)) {
          toDelete.push(redisKey);
        }
      }
    }
    if (toDelete.length === 0) return 0;
    const removed = await this.#client.del(toDelete);
    const count = typeof removed === 'number' ? removed : toDelete.length;
    this.#evictions += count;
    return count;
  }

  async stats(): Promise<ManifestStoreStats> {
    let size = 0;
    let bytes = 0;
    for await (const batch of this.#scanKeys()) {
      for (const redisKey of batch) {
        const raw = await this.#client.get(redisKey);
        if (raw == null) continue;
        size += 1;
        // UTF-16 char width matches the in-memory store's `bytes_approx`.
        bytes += raw.length * 2;
      }
    }
    return {
      size,
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions,
      bytes_approx: bytes,
    };
  }

  async list(): Promise<Array<{ key: ManifestStoreKey; value: StoredManifest }>> {
    const out: Array<{ key: ManifestStoreKey; value: StoredManifest }> = [];
    for await (const batch of this.#scanKeys()) {
      for (const redisKey of batch) {
        const raw = await this.#client.get(redisKey);
        if (raw == null) continue;
        let value: StoredManifest;
        try {
          value = JSON.parse(raw) as StoredManifest;
        } catch {
          continue;
        }
        const decoded = deserializeKey(redisKey.slice(this.#keyPrefix.length));
        if (!decoded) continue;
        out.push({ key: decoded, value });
      }
    }
    return out;
  }

  #redisKey(key: ManifestStoreKey): string {
    return `${this.#keyPrefix}${serializeKey(key)}`;
  }

  async #writeRaw(redisKey: string, value: StoredManifest): Promise<void> {
    const payload = JSON.stringify(value);
    const opts = this.#ttlSeconds > 0 ? { EX: this.#ttlSeconds } : undefined;
    await this.#client.set(redisKey, payload, opts);
  }

  /**
   * Iterate every key matching `${keyPrefix}*` in fixed-size batches.
   *
   * `scanIterator` in node-redis v5 yields batches of keys (`string[]`) — but
   * a few transitional builds (and reasonable test fakes) yield individual
   * strings instead. Normalize both shapes here so callers always see arrays.
   */
  async *#scanKeys(): AsyncGenerator<string[], void, unknown> {
    const iter = this.#client.scanIterator({
      MATCH: `${this.#keyPrefix}*`,
      COUNT: SCAN_BATCH,
    });
    for await (const item of iter as AsyncIterable<string | string[]>) {
      if (Array.isArray(item)) {
        if (item.length > 0) yield item;
      } else if (typeof item === 'string') {
        yield [item];
      }
    }
  }
}
