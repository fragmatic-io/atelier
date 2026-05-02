import { describe, expect, it, vi } from 'vitest';
import type { Trigger } from '@atelier/schemas';
import { wireTriggerInvalidation } from '../../src/triggers/invalidation.js';
import { InMemoryTriggerBus } from '../../src/triggers/memory-bus.js';
import { MemoryManifestCache } from '../../src/manifest/memory-cache.js';
import { ManifestFetcher } from '../../src/manifest/fetcher.js';
import { ManifestResolver } from '../../src/manifest/resolver.js';
import { fixtureManifest } from '../fixtures/manifest.js';
import type { CachedManifest } from '../../src/manifest/cache.js';

function entry(): CachedManifest {
  return {
    manifest: fixtureManifest(),
    fetched_at: '2026-04-29T12:00:00Z',
    last_used: '2026-04-29T12:00:00Z',
  };
}

async function seed(cache: MemoryManifestCache): Promise<void> {
  await cache.set({ user_id: 'vid', app_id: 'mail.example.com', route: '/today' }, entry());
  await cache.set({ user_id: 'vid', app_id: 'mail.example.com', route: '/inbox' }, entry());
  await cache.set({ user_id: 'other', app_id: 'mail.example.com', route: '/today' }, entry());
  await cache.set({ user_id: 'vid', app_id: 'cal.example.com', route: '/today' }, entry());
}

describe('wireTriggerInvalidation', () => {
  it('evicts entries by app_id on schema triggers', async () => {
    const bus = new InMemoryTriggerBus();
    const cache = new MemoryManifestCache();
    const onEvict = vi.fn();
    const off = wireTriggerInvalidation({ bus, cache, onEvict });
    await seed(cache);

    const trigger: Trigger = {
      type: 'capability.changed',
      app_id: 'mail.example.com',
      capability_id: 'thread.archive',
    };
    await bus.emit(trigger);

    expect(await cache.size()).toBe(1);
    expect(onEvict).toHaveBeenCalledWith('capability.changed', 3);
    off();
  });

  it('evicts entries by user_id on intent triggers', async () => {
    const bus = new InMemoryTriggerBus();
    const cache = new MemoryManifestCache();
    wireTriggerInvalidation({ bus, cache });
    await seed(cache);

    const trigger: Trigger = {
      type: 'intent.lens_switched',
      user_id: 'vid',
      app: 'mail.example.com',
      lens: 'founder_inbox',
    };
    await bus.emit(trigger);

    expect(await cache.size()).toBe(1); // only `other`'s manifest remains
  });

  it('user.recompile_route evicts the specific route only', async () => {
    const bus = new InMemoryTriggerBus();
    const cache = new MemoryManifestCache();
    wireTriggerInvalidation({ bus, cache });
    await seed(cache);

    await bus.emit({ type: 'user.recompile_route', user_id: 'vid', route: '/today' });
    // vid+/today across both apps is evicted (2 entries); /inbox for vid AND
    // /today for `other` remain.
    expect(await cache.size()).toBe(2);
    expect(
      await cache.get({ user_id: 'vid', app_id: 'mail.example.com', route: '/today' }),
    ).toBeNull();
    expect(
      await cache.get({ user_id: 'vid', app_id: 'cal.example.com', route: '/today' }),
    ).toBeNull();
  });

  it('user.recompile_all evicts every entry for the user', async () => {
    const bus = new InMemoryTriggerBus();
    const cache = new MemoryManifestCache();
    wireTriggerInvalidation({ bus, cache });
    await seed(cache);

    await bus.emit({ type: 'user.recompile_all', user_id: 'vid' });
    expect(await cache.size()).toBe(1);
  });

  it('user.try_lens evicts every entry for the user', async () => {
    const bus = new InMemoryTriggerBus();
    const cache = new MemoryManifestCache();
    wireTriggerInvalidation({ bus, cache });
    await seed(cache);

    await bus.emit({ type: 'user.try_lens', user_id: 'vid', lens_name: 'minimal' });
    expect(await cache.size()).toBe(1);
  });

  it('user.revert_manifest is intentionally a no-op for the cache', async () => {
    const bus = new InMemoryTriggerBus();
    const cache = new MemoryManifestCache();
    wireTriggerInvalidation({ bus, cache });
    await seed(cache);

    await bus.emit({
      type: 'user.revert_manifest',
      user_id: 'vid',
      manifest_id: 'm_8f3a2b1c',
    });
    expect(await cache.size()).toBe(4);
  });

  it('returns an unsubscribe that detaches every listener', () => {
    const bus = new InMemoryTriggerBus();
    const cache = new MemoryManifestCache();
    const off = wireTriggerInvalidation({ bus, cache });
    expect(bus.subscriberCount()).toBeGreaterThan(0);
    off();
    expect(bus.subscriberCount()).toBe(0);
  });

  it('skips events without an app_id/user_id field gracefully', async () => {
    const bus = new InMemoryTriggerBus();
    const cache = new MemoryManifestCache();
    wireTriggerInvalidation({ bus, cache });
    await seed(cache);
    // PolicyChangedTrigger carries app_id; no behavioral trigger should sneak in.
    await bus.emit({ type: 'policy.changed', app_id: 'mail.example.com', rule_id: 'r1' });
    expect(await cache.size()).toBe(1);
  });

  describe('markStaleInsteadOfEvict', () => {
    it('marks matching entries stale instead of removing them', async () => {
      const bus = new InMemoryTriggerBus();
      const cache = new MemoryManifestCache();
      const onEvict = vi.fn();
      wireTriggerInvalidation({ bus, cache, markStaleInsteadOfEvict: true, onEvict });
      await seed(cache);

      await bus.emit({
        type: 'capability.changed',
        app_id: 'mail.example.com',
        capability_id: 'thread.archive',
      });

      // Nothing was removed — entries were flipped to stale instead.
      expect(await cache.size()).toBe(4);
      expect(onEvict).toHaveBeenCalledWith('capability.changed', 3);
      expect(
        (await cache.get({ user_id: 'vid', app_id: 'mail.example.com', route: '/today' }))?.stale,
      ).toBe(true);
      expect(
        (await cache.get({ user_id: 'vid', app_id: 'cal.example.com', route: '/today' }))?.stale,
      ).toBeUndefined();
    });

    it('also routes user.recompile_route through stale-marking', async () => {
      const bus = new InMemoryTriggerBus();
      const cache = new MemoryManifestCache();
      wireTriggerInvalidation({ bus, cache, markStaleInsteadOfEvict: true });
      await seed(cache);

      await bus.emit({ type: 'user.recompile_route', user_id: 'vid', route: '/today' });
      expect(await cache.size()).toBe(4);
      expect(
        (await cache.get({ user_id: 'vid', app_id: 'mail.example.com', route: '/today' }))?.stale,
      ).toBe(true);
      expect(
        (await cache.get({ user_id: 'vid', app_id: 'mail.example.com', route: '/inbox' }))?.stale,
      ).toBeUndefined();
    });

    it('plays nicely with a SWR resolver: stale entries are still served', async () => {
      const bus = new InMemoryTriggerBus();
      const cache = new MemoryManifestCache();
      wireTriggerInvalidation({ bus, cache, markStaleInsteadOfEvict: true });

      // Seed one entry the resolver will read.
      const key = { user_id: 'vid', app_id: 'mail.example.com', route: '/today' };
      const seeded = fixtureManifest();
      seeded.manifest_id = 'm_seeded00';
      await cache.set(key, {
        manifest: seeded,
        fetched_at: '2026-04-29T11:00:00Z',
        last_used: '2026-04-29T11:00:00Z',
      });

      // The resolver's fetcher will only be hit for the background refresh.
      const refreshed = fixtureManifest();
      refreshed.manifest_id = 'm_refresh1';
      const fakeFetch = vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(refreshed), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );
      const fetcher = new ManifestFetcher({ baseUrl: 'https://m', fetch: fakeFetch, retries: 0 });
      const resolver = new ManifestResolver({ fetcher, cache, staleWhileRevalidate: true });

      // Trigger marks the entry stale instead of evicting.
      await bus.emit({
        type: 'capability.changed',
        app_id: 'mail.example.com',
        capability_id: 'thread.archive',
      });
      expect(await cache.size()).toBe(1);
      expect((await cache.get(key))?.stale).toBe(true);

      // Next read serves the (stale) seeded manifest immediately.
      const m = await resolver.resolve(key);
      expect(m.manifest_id).toBe('m_seeded00');

      // After the background refresh settles, the cache holds the new one.
      await new Promise((resolve) => setImmediate(resolve));
      expect((await cache.get(key))?.manifest.manifest_id).toBe('m_refresh1');
    });
  });
});
