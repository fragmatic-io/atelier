// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * `ManifestCache` interface and shared cache-key helpers.
 *
 * The runtime treats the cache as a black box keyed by `(user_id, app_id, route)`.
 * Implementations: `MemoryManifestCache` (Map-backed, in-process) and
 * `IndexedDBManifestCache` (`idb-keyval`, persistent). Both honor the same
 * contract.
 *
 * See `/Users/vid/cir/docs/caching.md` §"Local cache strategy" for the schema
 * this models. Byte-size eviction (50MB soft / 200MB hard cap) is deferred to
 * a later phase; we LRU on entry count for now — see the IndexedDB impl
 * comment.
 */

import type { Manifest } from '@cir/schemas';

/** Composite key the cache uses to look up a manifest. */
export interface ManifestCacheKey {
  user_id: string;
  app_id: string;
  route: string;
}

/** A manifest plus the metadata the runtime needs for LRU + revalidation. */
export interface CachedManifest {
  manifest: Manifest;
  /** ISO 8601 timestamp the runtime fetched this manifest. */
  fetched_at: string;
  /** Last `If-None-Match` token from the server, when present. */
  etag?: string;
  /** ISO 8601 timestamp the runtime last served this manifest. Updated on hit. */
  last_used: string;
  /**
   * When `true`, the entry is considered stale: it can still be served by a
   * resolver running in `staleWhileRevalidate` mode, but the resolver should
   * kick off a background refresh on the next read. Set by trigger
   * invalidation when `markStaleInsteadOfEvict` is configured. Cleared on the
   * next successful refetch. See `/Users/vid/cir/docs/caching.md` §"Semantic
   * invalidation" for the rationale.
   */
  stale?: boolean;
}

/**
 * The cache contract. Implementations are async because IndexedDB is async;
 * the in-memory impl just resolves immediately so callers can be
 * environment-agnostic.
 */
export interface ManifestCache {
  get(key: ManifestCacheKey): Promise<CachedManifest | null>;
  set(key: ManifestCacheKey, value: CachedManifest): Promise<void>;
  delete(key: ManifestCacheKey): Promise<void>;
  /**
   * Drop every entry where `predicate(key, value)` returns true. Returns the
   * number of entries removed. Used by `wireTriggerInvalidation` to evict
   * matching entries on schema/policy/intent triggers.
   */
  evictMatching(
    predicate: (key: ManifestCacheKey, value: CachedManifest) => boolean,
  ): Promise<number>;
  /**
   * Mark every entry where `predicate(key, value)` returns true as `stale`.
   * Returns the number of entries that flipped to stale (entries already
   * stale are still counted). Used by `wireTriggerInvalidation` when
   * `markStaleInsteadOfEvict` is set, so a stale-while-revalidate resolver
   * can keep serving the prior manifest while a fresh one compiles in the
   * background.
   */
  markStale(predicate: (key: ManifestCacheKey, value: CachedManifest) => boolean): Promise<number>;
  /** Total number of entries currently held. */
  size(): Promise<number>;
}

/**
 * Stable serialization of a cache key. The runtime uses `:` as a separator
 * because identifiers (per `@cir/schemas/common.ts`) cannot contain it.
 */
export function serializeCacheKey(key: ManifestCacheKey): string {
  return `${key.user_id}:${key.app_id}:${key.route}`;
}

/**
 * Inverse of `serializeCacheKey`. Returns null on a malformed string so the
 * IndexedDB impl can skip stray entries from older versions of the schema.
 *
 * Note: routes themselves can contain `:` (e.g. `/users/:id`). We split on
 * the first two delimiters only and treat the rest as the route.
 */
export function deserializeCacheKey(serialized: string): ManifestCacheKey | null {
  const firstColon = serialized.indexOf(':');
  if (firstColon < 0) return null;
  const secondColon = serialized.indexOf(':', firstColon + 1);
  if (secondColon < 0) return null;
  const user_id = serialized.slice(0, firstColon);
  const app_id = serialized.slice(firstColon + 1, secondColon);
  const route = serialized.slice(secondColon + 1);
  if (!user_id || !app_id || !route) return null;
  return { user_id, app_id, route };
}
