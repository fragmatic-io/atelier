import { describe, expect, it } from 'vitest';
import {
  deserializeCacheKey,
  serializeCacheKey,
  type CachedManifest,
  type ManifestCacheKey,
} from '../../src/manifest/cache.ts';
import { MemoryManifestCache } from '../../src/manifest/memory-cache.ts';
import { fixtureManifest } from '../fixtures/manifest.ts';

function entry(): CachedManifest {
  return {
    manifest: fixtureManifest(),
    fetched_at: '2026-04-29T12:00:00Z',
    last_used: '2026-04-29T12:00:00Z',
  };
}

describe('serializeCacheKey/deserializeCacheKey', () => {
  it('round-trips a simple key', () => {
    const key: ManifestCacheKey = { user_id: 'vid', app_id: 'mail.example.com', route: '/today' };
    const s = serializeCacheKey(key);
    expect(s).toBe('vid:mail.example.com:/today');
    expect(deserializeCacheKey(s)).toEqual(key);
  });

  it('handles routes that contain colons', () => {
    const key: ManifestCacheKey = { user_id: 'vid', app_id: 'mail', route: '/users/:id/profile' };
    const s = serializeCacheKey(key);
    expect(deserializeCacheKey(s)).toEqual(key);
  });

  it('returns null on malformed strings', () => {
    expect(deserializeCacheKey('no-colons')).toBeNull();
    expect(deserializeCacheKey('only:one-colon')).toBeNull();
    expect(deserializeCacheKey(':missing-user:/route')).toBeNull();
    expect(deserializeCacheKey('user::/route')).toBeNull();
    expect(deserializeCacheKey('user:app:')).toBeNull();
  });
});

describe('MemoryManifestCache', () => {
  const key1: ManifestCacheKey = { user_id: 'vid', app_id: 'mail.example.com', route: '/today' };
  const key2: ManifestCacheKey = {
    user_id: 'vid',
    app_id: 'mail.example.com',
    route: '/inbox',
  };
  const otherUser: ManifestCacheKey = {
    user_id: 'other',
    app_id: 'mail.example.com',
    route: '/today',
  };

  it('returns null on miss', async () => {
    const cache = new MemoryManifestCache();
    expect(await cache.get(key1)).toBeNull();
  });

  it('round-trips entries', async () => {
    const cache = new MemoryManifestCache();
    const value = entry();
    await cache.set(key1, value);
    expect(await cache.get(key1)).toEqual(value);
    expect(await cache.size()).toBe(1);
  });

  it('overwrites existing entries', async () => {
    const cache = new MemoryManifestCache();
    await cache.set(key1, entry());
    const updated: CachedManifest = { ...entry(), last_used: '2099-01-01T00:00:00Z' };
    await cache.set(key1, updated);
    expect((await cache.get(key1))?.last_used).toBe('2099-01-01T00:00:00Z');
    expect(await cache.size()).toBe(1);
  });

  it('deletes entries', async () => {
    const cache = new MemoryManifestCache();
    await cache.set(key1, entry());
    await cache.delete(key1);
    expect(await cache.get(key1)).toBeNull();
    // delete on empty is idempotent
    await cache.delete(key1);
  });

  it('evictMatching evicts only entries the predicate selects', async () => {
    const cache = new MemoryManifestCache();
    await cache.set(key1, entry());
    await cache.set(key2, entry());
    await cache.set(otherUser, entry());

    const removed = await cache.evictMatching((k) => k.user_id === 'vid');
    expect(removed).toBe(2);
    expect(await cache.get(key1)).toBeNull();
    expect(await cache.get(key2)).toBeNull();
    expect(await cache.get(otherUser)).not.toBeNull();
    expect(await cache.size()).toBe(1);
  });

  it('evictMatching returns 0 when nothing matches', async () => {
    const cache = new MemoryManifestCache();
    await cache.set(key1, entry());
    const removed = await cache.evictMatching(() => false);
    expect(removed).toBe(0);
  });

  it('exposes a snapshot for tests', () => {
    const cache = new MemoryManifestCache();
    expect(cache.entriesForTest().size).toBe(0);
  });

  it('markStale flags matching entries without removing them', async () => {
    const cache = new MemoryManifestCache();
    await cache.set(key1, entry());
    await cache.set(key2, entry());
    await cache.set(otherUser, entry());

    const marked = await cache.markStale((k) => k.user_id === 'vid');
    expect(marked).toBe(2);
    expect(await cache.size()).toBe(3); // nothing was removed
    expect((await cache.get(key1))?.stale).toBe(true);
    expect((await cache.get(key2))?.stale).toBe(true);
    expect((await cache.get(otherUser))?.stale).toBeUndefined();
  });
});
