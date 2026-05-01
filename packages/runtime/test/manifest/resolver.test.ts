import { describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '@cir/schemas';
import { ManifestFetcher } from '../../src/manifest/fetcher.js';
import { ManifestResolver, ManifestValidationError } from '../../src/manifest/resolver.js';
import { MemoryManifestCache } from '../../src/manifest/memory-cache.js';
import type { ManifestCacheKey } from '../../src/manifest/cache.js';
import type { AuditSink } from '../../src/audit/emit.js';
import { fixtureManifest } from '../fixtures/manifest.js';

const KEY: ManifestCacheKey = { user_id: 'vid', app_id: 'mail.example.com', route: '/today' };

function fakeFetcherFromManifest(manifestId: string): ManifestFetcher {
  const fakeFetch = vi.fn(() => {
    const m = fixtureManifest();
    m.manifest_id = manifestId;
    return Promise.resolve(
      new Response(JSON.stringify(m), {
        status: 200,
        headers: { 'content-type': 'application/json', etag: `v-${manifestId}` },
      }),
    );
  });
  return new ManifestFetcher({ baseUrl: 'https://m', fetch: fakeFetch, retries: 0 });
}

function captureSink(): { sink: AuditSink; events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    events,
    sink: {
      emit(event) {
        events.push(event);
      },
    },
  };
}

describe('ManifestResolver', () => {
  it('cache miss: fetches, validates, caches, emits manifest.compiled', async () => {
    const cache = new MemoryManifestCache();
    const fetcher = fakeFetcherFromManifest('m_aaaaaaaa');
    const { sink, events } = captureSink();

    const resolver = new ManifestResolver({ fetcher, cache, audit: sink });
    const m = await resolver.resolve(KEY);

    expect(m.manifest_id).toBe('m_aaaaaaaa');
    expect(await cache.size()).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('manifest.compiled');
    expect(events[0]?.manifest_id).toBe('m_aaaaaaaa');
  });

  it('cache hit: skips fetch, emits manifest.served, refreshes last_used', async () => {
    const cache = new MemoryManifestCache();
    const fakeFetch = vi.fn();
    const fetcher = new ManifestFetcher({ baseUrl: 'https://m', fetch: fakeFetch });
    const { sink, events } = captureSink();
    const ticks = ['2026-04-29T12:00:00Z', '2026-04-29T13:00:00Z', '2026-04-29T13:00:01Z'];
    let i = 0;
    const clock = (): string => ticks[i++] ?? '2026-04-29T13:00:02Z';

    const resolver = new ManifestResolver({ fetcher, cache, audit: sink, clock });
    await cache.set(KEY, {
      manifest: fixtureManifest(),
      fetched_at: '2026-04-29T11:00:00Z',
      last_used: '2026-04-29T11:00:00Z',
    });

    const m = await resolver.resolve(KEY);
    expect(m.manifest_id).toBe('m_8f3a2b1c');
    expect(fakeFetch).not.toHaveBeenCalled();
    const cached = await cache.get(KEY);
    expect(cached?.last_used).toBe('2026-04-29T12:00:00Z');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('manifest.served');
  });

  it('forceRefresh: skips cache and refetches', async () => {
    const cache = new MemoryManifestCache();
    const fetcher = fakeFetcherFromManifest('m_bbbbbbbb');
    const resolver = new ManifestResolver({ fetcher, cache });
    await cache.set(KEY, {
      manifest: fixtureManifest(),
      fetched_at: '2026-04-29T11:00:00Z',
      last_used: '2026-04-29T11:00:00Z',
    });
    const m = await resolver.resolve(KEY, { forceRefresh: true });
    expect(m.manifest_id).toBe('m_bbbbbbbb');
  });

  it('rejects manifests that fail validation and does NOT cache them', async () => {
    const cache = new MemoryManifestCache();
    const fetcher = fakeFetcherFromManifest('m_cccccccc');
    const { sink, events } = captureSink();
    const resolver = new ManifestResolver({
      fetcher,
      cache,
      audit: sink,
      validate: () => ({ ok: false, reasons: ['policy_x', 'policy_y'] }),
    });

    await expect(resolver.resolve(KEY)).rejects.toBeInstanceOf(ManifestValidationError);
    expect(await cache.size()).toBe(0);
    expect(events.some((e) => e.type === 'policy.violated')).toBe(true);
  });

  it('passes validation when validate() returns ok', async () => {
    const cache = new MemoryManifestCache();
    const fetcher = fakeFetcherFromManifest('m_dddddddd');
    const validate = vi.fn(() => ({ ok: true as const }));
    const resolver = new ManifestResolver({ fetcher, cache, validate });
    await resolver.resolve(KEY);
    expect(validate).toHaveBeenCalledOnce();
  });

  it('persists etag returned by the fetcher', async () => {
    const cache = new MemoryManifestCache();
    const fetcher = fakeFetcherFromManifest('m_eeeeeeee');
    const resolver = new ManifestResolver({ fetcher, cache });
    await resolver.resolve(KEY);
    const cached = await cache.get(KEY);
    expect(cached?.etag).toBe('v-m_eeeeeeee');
  });

  it('audit sink errors do not break resolve', async () => {
    const cache = new MemoryManifestCache();
    const fetcher = fakeFetcherFromManifest('m_ffffffff');
    const sink: AuditSink = {
      emit() {
        throw new Error('audit down');
      },
    };
    const resolver = new ManifestResolver({ fetcher, cache, audit: sink });
    await expect(resolver.resolve(KEY)).resolves.toBeDefined();
  });

  it('ManifestValidationError carries reasons and key', () => {
    const err = new ManifestValidationError(KEY, ['r1']);
    expect(err.reasons).toEqual(['r1']);
    expect(err.key).toEqual(KEY);
    expect(err.name).toBe('ManifestValidationError');
  });

  describe('staleWhileRevalidate', () => {
    it('serves a stale entry immediately and refreshes in the background', async () => {
      const cache = new MemoryManifestCache();
      const fetcher = fakeFetcherFromManifest('m_swr11111');
      const { sink, events } = captureSink();

      // Seed a stale cached manifest with a different id than the fetcher
      // returns, so we can tell which one was served and which was refreshed.
      const stale = fixtureManifest();
      stale.manifest_id = 'm_stale000';
      await cache.set(KEY, {
        manifest: stale,
        fetched_at: '2026-04-29T11:00:00Z',
        last_used: '2026-04-29T11:00:00Z',
        stale: true,
      });

      const resolver = new ManifestResolver({
        fetcher,
        cache,
        audit: sink,
        staleWhileRevalidate: true,
      });
      const m = await resolver.resolve(KEY);

      // Foreground caller got the STALE manifest immediately.
      expect(m.manifest_id).toBe('m_stale000');

      // The background refresh is fire-and-forget. Wait for it to settle.
      await new Promise((resolve) => setImmediate(resolve));
      const after = await cache.get(KEY);
      expect(after?.manifest.manifest_id).toBe('m_swr11111');
      expect(after?.stale).toBeUndefined(); // freshly cached, not stale anymore.

      // Both `manifest.served` (foreground) AND `manifest.compiled`
      // (background refresh) should fire.
      expect(events.map((e) => e.type).sort()).toEqual(['manifest.compiled', 'manifest.served']);
    });

    it('with SWR off: a stale entry is treated as a miss', async () => {
      const cache = new MemoryManifestCache();
      const fetcher = fakeFetcherFromManifest('m_swr22222');
      const { sink, events } = captureSink();

      const stale = fixtureManifest();
      stale.manifest_id = 'm_stale111';
      await cache.set(KEY, {
        manifest: stale,
        fetched_at: '2026-04-29T11:00:00Z',
        last_used: '2026-04-29T11:00:00Z',
        stale: true,
      });

      const resolver = new ManifestResolver({ fetcher, cache, audit: sink });
      const m = await resolver.resolve(KEY);

      // SWR off: caller blocks on the fresh fetch.
      expect(m.manifest_id).toBe('m_swr22222');
      expect(events.map((e) => e.type)).toEqual(['manifest.compiled']);
      expect((await cache.get(KEY))?.manifest.manifest_id).toBe('m_swr22222');
    });

    it('coalesces concurrent SWR background refreshes for the same key', async () => {
      const cache = new MemoryManifestCache();
      let fetchCount = 0;
      const fakeFetch = vi.fn(() => {
        fetchCount += 1;
        const m = fixtureManifest();
        m.manifest_id = `m_swrxxxxx`;
        return Promise.resolve(
          new Response(JSON.stringify(m), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });
      const fetcher = new ManifestFetcher({ baseUrl: 'https://m', fetch: fakeFetch, retries: 0 });

      const stale = fixtureManifest();
      stale.manifest_id = 'm_stale222';
      await cache.set(KEY, {
        manifest: stale,
        fetched_at: '2026-04-29T11:00:00Z',
        last_used: '2026-04-29T11:00:00Z',
        stale: true,
      });

      const resolver = new ManifestResolver({
        fetcher,
        cache,
        staleWhileRevalidate: true,
      });

      // Two concurrent reads while the entry is stale should share one
      // background refresh, not fire two.
      const [a, b] = await Promise.all([resolver.resolve(KEY), resolver.resolve(KEY)]);
      expect(a.manifest_id).toBe('m_stale222');
      expect(b.manifest_id).toBe('m_stale222');
      await new Promise((resolve) => setImmediate(resolve));
      expect(fetchCount).toBe(1);
    });

    it('reports background refresh errors via onBackgroundError', async () => {
      const cache = new MemoryManifestCache();
      const fakeFetch = vi.fn(() => Promise.resolve(new Response('boom', { status: 500 })));
      const fetcher = new ManifestFetcher({ baseUrl: 'https://m', fetch: fakeFetch, retries: 0 });
      const onBackgroundError = vi.fn();

      const stale = fixtureManifest();
      stale.manifest_id = 'm_stale333';
      await cache.set(KEY, {
        manifest: stale,
        fetched_at: '2026-04-29T11:00:00Z',
        last_used: '2026-04-29T11:00:00Z',
        stale: true,
      });

      const resolver = new ManifestResolver({
        fetcher,
        cache,
        staleWhileRevalidate: true,
        onBackgroundError,
      });
      const m = await resolver.resolve(KEY);
      expect(m.manifest_id).toBe('m_stale333');
      // Wait for the background task to settle.
      await new Promise((resolve) => setImmediate(resolve));
      expect(onBackgroundError).toHaveBeenCalledOnce();
      const stillCached = await cache.get(KEY);
      // Cache still holds the stale entry — refresh failed.
      expect(stillCached?.manifest.manifest_id).toBe('m_stale333');
    });
  });
});
