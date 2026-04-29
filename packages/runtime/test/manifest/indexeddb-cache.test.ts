// Set up the fake-indexeddb shim BEFORE idb-keyval is imported.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'idb-keyval';
import { IndexedDBManifestCache } from '../../src/manifest/indexeddb-cache.ts';
import type { CachedManifest, ManifestCacheKey } from '../../src/manifest/cache.ts';
import { fixtureManifest } from '../fixtures/manifest.ts';

function entry(last_used: string): CachedManifest {
  return {
    manifest: fixtureManifest(),
    fetched_at: '2026-04-29T12:00:00Z',
    last_used,
  };
}

describe('IndexedDBManifestCache', () => {
  let dbName: string;
  let cache: IndexedDBManifestCache;

  beforeEach(() => {
    // Each test gets its own DB so they cannot interfere.
    dbName = `cir-manifests-${Math.random().toString(36).slice(2)}`;
    cache = new IndexedDBManifestCache({ dbName, storeName: 'manifests' });
  });

  afterEach(async () => {
    // Clear by evicting everything; the fake-indexeddb shim leaks across
    // tests if we don't.
    await cache.evictMatching(() => true);
  });

  const key1: ManifestCacheKey = { user_id: 'vid', app_id: 'mail.example.com', route: '/today' };
  const key2: ManifestCacheKey = { user_id: 'vid', app_id: 'mail.example.com', route: '/inbox' };

  it('returns null on miss', async () => {
    expect(await cache.get(key1)).toBeNull();
  });

  it('round-trips entries with set/get', async () => {
    const value = entry('2026-04-29T12:00:00Z');
    await cache.set(key1, value);
    expect(await cache.get(key1)).toEqual(value);
    expect(await cache.size()).toBe(1);
  });

  it('deletes entries', async () => {
    await cache.set(key1, entry('2026-04-29T12:00:00Z'));
    await cache.delete(key1);
    expect(await cache.get(key1)).toBeNull();
  });

  it('evictMatching evicts only entries the predicate selects', async () => {
    await cache.set(key1, entry('2026-04-29T12:00:00Z'));
    await cache.set(key2, entry('2026-04-29T12:00:00Z'));
    const removed = await cache.evictMatching((k) => k.route === '/today');
    expect(removed).toBe(1);
    expect(await cache.get(key1)).toBeNull();
    expect(await cache.get(key2)).not.toBeNull();
  });

  it('LRU-evicts oldest entries when over the cap', async () => {
    const small = new IndexedDBManifestCache({
      dbName: `cir-manifests-lru-${Math.random().toString(36).slice(2)}`,
      maxEntries: 2,
    });
    const a: ManifestCacheKey = { user_id: 'vid', app_id: 'mail', route: '/a' };
    const b: ManifestCacheKey = { user_id: 'vid', app_id: 'mail', route: '/b' };
    const c: ManifestCacheKey = { user_id: 'vid', app_id: 'mail', route: '/c' };

    await small.set(a, entry('2026-04-29T10:00:00Z'));
    await small.set(b, entry('2026-04-29T11:00:00Z'));
    await small.set(c, entry('2026-04-29T12:00:00Z'));

    // Oldest (a) should be evicted.
    expect(await small.get(a)).toBeNull();
    expect(await small.get(b)).not.toBeNull();
    expect(await small.get(c)).not.toBeNull();
    expect(await small.size()).toBe(2);
  });

  it('clamps maxEntries to >= 1', async () => {
    const tiny = new IndexedDBManifestCache({
      dbName: `cir-manifests-tiny-${Math.random().toString(36).slice(2)}`,
      maxEntries: 0,
    });
    const a: ManifestCacheKey = { user_id: 'vid', app_id: 'mail', route: '/a' };
    const b: ManifestCacheKey = { user_id: 'vid', app_id: 'mail', route: '/b' };
    await tiny.set(a, entry('2026-04-29T10:00:00Z'));
    await tiny.set(b, entry('2026-04-29T11:00:00Z'));
    expect(await tiny.size()).toBe(1);
  });

  it('accepts an injected store', async () => {
    const dbN = `cir-manifests-injected-${Math.random().toString(36).slice(2)}`;
    const store = createStore(dbN, 'manifests');
    const c = new IndexedDBManifestCache({ store });
    await c.set(key1, entry('2026-04-29T12:00:00Z'));
    expect(await c.get(key1)).not.toBeNull();
  });

  it('reports total bytes via .bytes()', async () => {
    await cache.set(key1, entry('2026-04-29T12:00:00Z'));
    await cache.set(key2, entry('2026-04-29T12:01:00Z'));
    const bytes = await cache.bytes();
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeGreaterThan(JSON.stringify(entry('2026-04-29T12:00:00Z')).length);
  });

  it('byte-evicts oldest entries when over maxBytes', async () => {
    // Each cached fixture serializes to a few hundred bytes; cap at 1 KiB so
    // the second insert forces an eviction.
    const oneEntryBytes = JSON.stringify(entry('2026-04-29T12:00:00Z')).length * 2;
    const small = new IndexedDBManifestCache({
      dbName: `cir-manifests-bytes-${Math.random().toString(36).slice(2)}`,
      maxEntries: 100,
      maxBytes: oneEntryBytes + 50, // room for 1 entry only
    });
    const a: ManifestCacheKey = { user_id: 'vid', app_id: 'mail', route: '/a' };
    const b: ManifestCacheKey = { user_id: 'vid', app_id: 'mail', route: '/b' };

    await small.set(a, entry('2026-04-29T10:00:00Z'));
    await small.set(b, entry('2026-04-29T11:00:00Z'));

    // Oldest (a) should be evicted by byte cap.
    expect(await small.get(a)).toBeNull();
    expect(await small.get(b)).not.toBeNull();
    expect(await small.size()).toBe(1);
    expect(await small.bytes()).toBeLessThanOrEqual(oneEntryBytes + 50);
  });

  it('does not leak the private __bytes hint on get()', async () => {
    await cache.set(key1, entry('2026-04-29T12:00:00Z'));
    const got = await cache.get(key1);
    expect(got).not.toBeNull();
    // The returned shape must match CachedManifest exactly — no __bytes leak.
    expect(Object.keys(got!).sort()).toEqual(['fetched_at', 'last_used', 'manifest']);
  });
});
