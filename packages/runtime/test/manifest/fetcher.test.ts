import { describe, expect, it, vi } from 'vitest';
import { ManifestFetcher, ManifestFetchError } from '../../src/manifest/fetcher.ts';
import type { ManifestCacheKey } from '../../src/manifest/cache.ts';
import { fixtureManifest } from '../fixtures/manifest.ts';

const KEY: ManifestCacheKey = { user_id: 'vid', app_id: 'mail.example.com', route: '/today' };

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('ManifestFetcher', () => {
  it('fetches and parses a manifest on the happy path', async () => {
    const fakeFetch = vi.fn(() =>
      Promise.resolve(jsonResponse(fixtureManifest(), { headers: { etag: 'v1' } })),
    );
    const fetcher = new ManifestFetcher({ baseUrl: 'https://m.example/', fetch: fakeFetch });
    const result = await fetcher.fetch(KEY);
    expect(result.manifest.manifest_id).toBe('m_8f3a2b1c');
    expect(result.etag).toBe('v1');
    // URL is well-formed and trims trailing slash on the base.
    const calls = fakeFetch.mock.calls as Array<[string, unknown?]>;
    const url = calls[0]?.[0];
    expect(url).toBe(
      `https://m.example/manifest/${encodeURIComponent('vid')}/${encodeURIComponent('mail.example.com')}/${encodeURIComponent('/today')}`,
    );
  });

  it('omits etag when the server does not send one', async () => {
    const fakeFetch = vi.fn(() => Promise.resolve(jsonResponse(fixtureManifest())));
    const fetcher = new ManifestFetcher({ baseUrl: 'https://m.example', fetch: fakeFetch });
    const result = await fetcher.fetch(KEY);
    expect(result.etag).toBeUndefined();
  });

  it('throws non-retriable on 404', async () => {
    const fakeFetch = vi.fn(() =>
      Promise.resolve(
        new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } }),
      ),
    );
    const fetcher = new ManifestFetcher({ baseUrl: 'https://m.example', fetch: fakeFetch });
    await expect(fetcher.fetch(KEY)).rejects.toBeInstanceOf(ManifestFetchError);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 with exponential backoff and eventually succeeds', async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(fixtureManifest()));
    const fetcher = new ManifestFetcher({
      baseUrl: 'https://m.example',
      fetch: fakeFetch,
      retries: 2,
      retryDelayMs: 1,
    });
    const result = await fetcher.fetch(KEY);
    expect(result.manifest.manifest_id).toBe('m_8f3a2b1c');
    expect(fakeFetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after exhausting retries on 500', async () => {
    const fakeFetch = vi.fn(() => Promise.resolve(new Response('boom', { status: 500 })));
    const fetcher = new ManifestFetcher({
      baseUrl: 'https://m.example',
      fetch: fakeFetch,
      retries: 1,
      retryDelayMs: 1,
    });
    await expect(fetcher.fetch(KEY)).rejects.toBeInstanceOf(ManifestFetchError);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on network errors', async () => {
    const fakeFetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(jsonResponse(fixtureManifest()));
    const fetcher = new ManifestFetcher({
      baseUrl: 'https://m.example',
      fetch: fakeFetch,
      retries: 1,
      retryDelayMs: 1,
    });
    const result = await fetcher.fetch(KEY);
    expect(result.manifest.manifest_id).toBe('m_8f3a2b1c');
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it('honors AbortSignal before the first attempt', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('Cancelled', 'AbortError'));
    const fakeFetch = vi.fn();
    const fetcher = new ManifestFetcher({
      baseUrl: 'https://m.example',
      fetch: fakeFetch,
      signal: controller.signal,
    });
    await expect(fetcher.fetch(KEY)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('honors AbortSignal between retries', async () => {
    const controller = new AbortController();
    const fakeFetch = vi.fn(() => {
      // Abort right after the first failed call so the sleep aborts.
      queueMicrotask(() => controller.abort(new DOMException('Cancelled', 'AbortError')));
      return Promise.resolve(new Response('boom', { status: 500 }));
    });
    const fetcher = new ManifestFetcher({
      baseUrl: 'https://m.example',
      fetch: fakeFetch,
      signal: controller.signal,
      retries: 5,
      retryDelayMs: 50,
    });
    await expect(fetcher.fetch(KEY)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
