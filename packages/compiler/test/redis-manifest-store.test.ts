/* eslint-disable @typescript-eslint/require-await -- fake redis client signatures must be Promise-returning to match the real client; bodies do not always need await */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RedisClientType } from 'redis';
import { RedisManifestStore, type RedisManifestStoreOptions } from '../src/redis-manifest-store.ts';
import type { ManifestStoreKey, StoredManifest } from '../src/manifest-store.ts';
import type { Manifest } from '@cir/schemas';

/**
 * Tiny in-memory fake of the node-redis v5 surface we actually use. Backed by
 * a `Map<string, string>` plus optional TTL tracking. Each command is wrapped
 * in `vi.fn()` so individual tests can spy on call patterns (TTL options, scan
 * cursors, etc.) without introducing a new dev dependency.
 */
function makeFakeClient() {
  const storage = new Map<string, { value: string; expiresAt: number | null }>();

  const get = vi.fn(async (key: string): Promise<string | null> => {
    const entry = storage.get(key);
    if (!entry) return null;
    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
      storage.delete(key);
      return null;
    }
    return entry.value;
  });

  const set = vi.fn(
    async (key: string, value: string, options?: { EX?: number }): Promise<'OK'> => {
      const expiresAt = options?.EX ? Date.now() + options.EX * 1000 : null;
      storage.set(key, { value, expiresAt });
      return 'OK';
    },
  );

  const del = vi.fn(async (keys: string | string[]): Promise<number> => {
    const arr = Array.isArray(keys) ? keys : [keys];
    let count = 0;
    for (const k of arr) {
      if (storage.delete(k)) count += 1;
    }
    return count;
  });

  // Yield a single batch of all matching keys (good enough for tests).
  const scanIterator = vi.fn(function (options?: {
    MATCH?: string;
    COUNT?: number;
  }): AsyncGenerator<string[], void, unknown> {
    const match = options?.MATCH ?? '*';
    // Convert glob `prefix*` into a starts-with check (the only pattern the
    // store uses today).
    const prefix = match.endsWith('*') ? match.slice(0, -1) : '';
    const keys = [...storage.keys()].filter((k) => (prefix ? k.startsWith(prefix) : k === match));
    return (async function* () {
      if (keys.length > 0) yield keys;
    })();
  });

  const dbSize = vi.fn(async (): Promise<number> => storage.size);

  return {
    storage,
    client: {
      get,
      set,
      del,
      scanIterator,
      dbSize,
    } as unknown as RedisClientType,
    spies: { get, set, del, scanIterator, dbSize },
  };
}

function sampleManifest(): Manifest {
  return {
    schema_version: 1,
    app_id: 'demo',
    route: '/inbox',
    layout: { kind: 'stack', children: [] },
    capabilities: [],
    skills: [],
  } as unknown as Manifest;
}

function sampleStored(overrides: Partial<StoredManifest> = {}): StoredManifest {
  return {
    manifest: sampleManifest(),
    compiler_id: 'gemini@1',
    compiled_at: '2026-04-29T00:00:00.000Z',
    last_used: '2026-04-29T00:00:00.000Z',
    token_cost: 1234,
    trigger_chain: ['cold'],
    ...overrides,
  };
}

const baseKey: ManifestStoreKey = {
  user_id: 'u1',
  app_id: 'demo',
  route: '/inbox',
  capability_version: 'v1',
  intent_profile_version: 1,
  skill_set_hash: 'h1',
  brand_kit_version: 'b1',
};

function makeStore(extra: Partial<RedisManifestStoreOptions> = {}) {
  const fake = makeFakeClient();
  const store = new RedisManifestStore({ client: fake.client, ...extra });
  return { store, ...fake };
}

describe('RedisManifestStore', () => {
  const now = Date.parse('2026-04-29T12:00:00.000Z');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
  });

  describe('get/set round-trips', () => {
    it('returns the stored value (with refreshed last_used) on hit', async () => {
      const { store, spies } = makeStore({ ttlSeconds: 0 });
      await store.set(baseKey, sampleStored());
      const got = await store.get(baseKey);

      expect(got).not.toBeNull();
      expect(got?.token_cost).toBe(1234);
      expect(got?.compiler_id).toBe('gemini@1');
      // last_used should be refreshed to "now"
      expect(got?.last_used).toBe(new Date(now).toISOString());
      // get → write-back happens (refresh path)
      expect(spies.get).toHaveBeenCalled();
      expect(spies.set).toHaveBeenCalledTimes(2); // initial set + refresh
    });

    it('uses the configured key prefix', async () => {
      const { store, storage } = makeStore({ keyPrefix: 'custom:m:' });
      await store.set(baseKey, sampleStored());
      const stored = [...storage.keys()];
      expect(stored).toHaveLength(1);
      expect(stored[0]?.startsWith('custom:m:')).toBe(true);
    });
  });

  describe('delete', () => {
    it('removes the entry', async () => {
      const { store, storage } = makeStore({ ttlSeconds: 0 });
      await store.set(baseKey, sampleStored());
      expect(storage.size).toBe(1);
      await store.delete(baseKey);
      expect(storage.size).toBe(0);
      const got = await store.get(baseKey);
      expect(got).toBeNull();
    });
  });

  describe('miss', () => {
    it('returns null on missing key and increments misses', async () => {
      const { store } = makeStore({ ttlSeconds: 0 });
      const got = await store.get(baseKey);
      expect(got).toBeNull();
      const stats = await store.stats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
    });
  });

  describe('evictMatching', () => {
    it('scans, evaluates predicate, deletes only matching entries', async () => {
      const { store, storage, spies } = makeStore({ ttlSeconds: 0 });
      const k1 = baseKey;
      const k2: ManifestStoreKey = { ...baseKey, route: '/settings' };
      const k3: ManifestStoreKey = { ...baseKey, route: '/profile' };
      await store.set(k1, sampleStored());
      await store.set(k2, sampleStored());
      await store.set(k3, sampleStored());
      expect(storage.size).toBe(3);

      const removed = await store.evictMatching((k) => k.route === '/settings');
      expect(removed).toBe(1);
      expect(storage.size).toBe(2);
      expect(spies.scanIterator).toHaveBeenCalled();

      const stats = await store.stats();
      expect(stats.evictions).toBe(1);
      expect(stats.size).toBe(2);
    });

    it('returns 0 when nothing matches', async () => {
      const { store } = makeStore({ ttlSeconds: 0 });
      await store.set(baseKey, sampleStored());
      const removed = await store.evictMatching(() => false);
      expect(removed).toBe(0);
    });
  });

  describe('TTL', () => {
    it('passes EX option when ttlSeconds > 0', async () => {
      const { store, spies } = makeStore({ ttlSeconds: 60 });
      await store.set(baseKey, sampleStored());
      const lastCall = spies.set.mock.calls.at(-1);
      expect(lastCall?.[2]).toEqual({ EX: 60 });
    });

    it('does NOT pass EX when ttlSeconds is 0', async () => {
      const { store, spies } = makeStore({ ttlSeconds: 0 });
      await store.set(baseKey, sampleStored());
      const lastCall = spies.set.mock.calls.at(-1);
      expect(lastCall?.[2]).toBeUndefined();
    });

    it('defaults to 7 days when ttlSeconds is omitted', async () => {
      const { store, spies } = makeStore();
      await store.set(baseKey, sampleStored());
      const lastCall = spies.set.mock.calls.at(-1);
      expect(lastCall?.[2]).toEqual({ EX: 604_800 });
    });
  });

  describe('prefix isolation', () => {
    it('two stores with different prefixes do not see each other', async () => {
      const fake = makeFakeClient();
      const a = new RedisManifestStore({
        client: fake.client,
        keyPrefix: 'cir:a:',
        ttlSeconds: 0,
      });
      const b = new RedisManifestStore({
        client: fake.client,
        keyPrefix: 'cir:b:',
        ttlSeconds: 0,
      });

      await a.set(baseKey, sampleStored({ token_cost: 111 }));
      await b.set(baseKey, sampleStored({ token_cost: 222 }));

      const fromA = await a.get(baseKey);
      const fromB = await b.get(baseKey);
      expect(fromA?.token_cost).toBe(111);
      expect(fromB?.token_cost).toBe(222);

      const listA = await a.list();
      const listB = await b.list();
      expect(listA).toHaveLength(1);
      expect(listB).toHaveLength(1);

      // Eviction in A must not touch B.
      await a.evictMatching(() => true);
      expect(await a.list()).toHaveLength(0);
      expect(await b.list()).toHaveLength(1);
    });
  });

  describe('list + stats', () => {
    it('list() decodes every entry back to its structured key', async () => {
      const { store } = makeStore({ ttlSeconds: 0 });
      const k1 = baseKey;
      const k2: ManifestStoreKey = {
        user_id: 'u2',
        app_id: 'demo',
        route: '/profile',
        // intentionally omit optional fields to exercise the '*' encoding
      };
      await store.set(k1, sampleStored());
      await store.set(k2, sampleStored({ token_cost: 999 }));

      const all = await store.list();
      expect(all).toHaveLength(2);
      const byRoute = new Map(all.map((e) => [e.key.route, e]));
      expect(byRoute.get('/inbox')?.key.user_id).toBe('u1');
      expect(byRoute.get('/profile')?.key.user_id).toBe('u2');
      expect(byRoute.get('/profile')?.key.capability_version).toBeUndefined();
    });

    it('stats() reports size and approximate byte count', async () => {
      const { store } = makeStore({ ttlSeconds: 0 });
      await store.set(baseKey, sampleStored());
      const stats = await store.stats();
      expect(stats.size).toBe(1);
      expect(stats.bytes_approx).toBeGreaterThan(0);
    });
  });

  describe('corrupt entry handling', () => {
    it('returns null and removes the bad key on JSON parse failure', async () => {
      const { store, storage, spies } = makeStore({ ttlSeconds: 0 });
      const redisKey = `cir:manifest:${[
        baseKey.user_id,
        baseKey.app_id,
        baseKey.route,
        baseKey.capability_version,
        String(baseKey.intent_profile_version),
        baseKey.skill_set_hash,
        baseKey.brand_kit_version,
      ].join('|')}`;
      storage.set(redisKey, { value: '{not json', expiresAt: null });

      const got = await store.get(baseKey);
      expect(got).toBeNull();
      expect(spies.del).toHaveBeenCalled();
      expect(storage.has(redisKey)).toBe(false);
    });
  });
});
