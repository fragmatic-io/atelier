// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `MemoryManifestStore` (Tier-3 in-memory cache). Exercises
 * get/set/delete round-trips, hit/miss accounting, predicate-based eviction,
 * stats reporting, list snapshots, and LRU enforcement when the entry cap is
 * exceeded.
 */

import { describe, expect, it } from 'vitest';
import {
  MemoryManifestStore,
  type ManifestStoreKey,
  type StoredManifest,
} from '../src/manifest-store.ts';
import { fixtureManifest } from './_fixtures.ts';

const baseKey: ManifestStoreKey = {
  user_id: 'u1',
  app_id: 'cir.demo',
  route: '/today',
  capability_version: '1.0.0',
  intent_profile_version: 1,
  brand_kit_version: '1.0.0',
};

function entry(overrides: Partial<StoredManifest> = {}): StoredManifest {
  return {
    manifest: fixtureManifest(),
    compiler_id: 'gemini@1',
    compiled_at: '2026-04-29T12:00:00.000Z',
    last_used: '2026-04-29T12:00:00.000Z',
    token_cost: 100,
    ...overrides,
  };
}

describe('MemoryManifestStore', () => {
  it('get returns null on miss and increments misses', async () => {
    const store = new MemoryManifestStore();
    expect(await store.get(baseKey)).toBeNull();
    const stats = await store.stats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);
    expect(stats.size).toBe(0);
  });

  it('set then get round-trips, increments hits, and refreshes last_used', async () => {
    const store = new MemoryManifestStore();
    const before = entry({ last_used: '2020-01-01T00:00:00.000Z' });
    await store.set(baseKey, before);
    const after = await store.get(baseKey);
    expect(after).not.toBeNull();
    expect(after?.token_cost).toBe(100);
    expect(after?.last_used).not.toBe('2020-01-01T00:00:00.000Z');
    const stats = await store.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(0);
  });

  it('delete removes the entry', async () => {
    const store = new MemoryManifestStore();
    await store.set(baseKey, entry());
    await store.delete(baseKey);
    expect(await store.get(baseKey)).toBeNull();
  });

  it('evictMatching evicts only matching entries and increments evictions', async () => {
    const store = new MemoryManifestStore();
    const k1 = baseKey;
    const k2 = { ...baseKey, route: '/inbox' };
    const k3 = { ...baseKey, route: '/profile' };
    await store.set(k1, entry());
    await store.set(k2, entry());
    await store.set(k3, entry());

    const removed = await store.evictMatching((k) => k.route !== '/today');
    expect(removed).toBe(2);
    const stats = await store.stats();
    expect(stats.evictions).toBe(2);
    expect(stats.size).toBe(1);
  });

  it('stats reports hits/misses/evictions/size/bytes_approx', async () => {
    const store = new MemoryManifestStore();
    await store.set(baseKey, entry());
    await store.get(baseKey); // hit
    await store.get({ ...baseKey, route: '/missing' }); // miss

    const stats = await store.stats();
    expect(stats.size).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.evictions).toBe(0);
    expect(stats.bytes_approx).toBeGreaterThan(0);
  });

  it('list returns every entry currently held', async () => {
    const store = new MemoryManifestStore();
    await store.set(baseKey, entry());
    await store.set({ ...baseKey, route: '/inbox' }, entry({ token_cost: 5 }));
    const all = await store.list();
    expect(all).toHaveLength(2);
    const routes = all.map((e) => e.key.route).sort();
    expect(routes).toEqual(['/inbox', '/today']);
  });

  it('enforceLru drops oldest last_used when over maxEntries', async () => {
    const store = new MemoryManifestStore({ maxEntries: 2 });
    await store.set(
      { ...baseKey, route: '/oldest' },
      entry({ last_used: '2020-01-01T00:00:00.000Z' }),
    );
    await store.set(
      { ...baseKey, route: '/middle' },
      entry({ last_used: '2022-01-01T00:00:00.000Z' }),
    );
    await store.set(
      { ...baseKey, route: '/newest' },
      entry({ last_used: '2024-01-01T00:00:00.000Z' }),
    );

    const all = await store.list();
    const routes = all.map((e) => e.key.route).sort();
    expect(routes).toEqual(['/middle', '/newest']);
    const stats = await store.stats();
    expect(stats.evictions).toBeGreaterThanOrEqual(1);
  });
});
