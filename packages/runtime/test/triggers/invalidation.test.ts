import { describe, expect, it, vi } from 'vitest';
import type { Trigger } from '@cir/schemas';
import { wireTriggerInvalidation } from '../../src/triggers/invalidation.ts';
import { InMemoryTriggerBus } from '../../src/triggers/memory-bus.ts';
import { MemoryManifestCache } from '../../src/manifest/memory-cache.ts';
import { fixtureManifest } from '../fixtures/manifest.ts';
import type { CachedManifest } from '../../src/manifest/cache.ts';

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
});
