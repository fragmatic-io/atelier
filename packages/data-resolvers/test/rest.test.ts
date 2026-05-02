// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

import { describe, expect, it, vi } from 'vitest';
import { RestDataResolver, buildRestUrl } from '../src/rest.js';

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('RestDataResolver', () => {
  it('falls back to baseUrl + dotted path when no urlMap entry matches', () => {
    const url = buildRestUrl(
      { source: 'dummyjson.product.list' },
      { baseUrl: 'https://dummyjson.com/' },
    );
    expect(url).toBe('https://dummyjson.com/dummyjson/product/list');
  });

  it('uses urlMap string templates with ${source} substitution', () => {
    const url = buildRestUrl(
      { source: 'dummyjson.product.search', filter: 'q = "phone"' },
      {
        urlMap: { 'dummyjson.product.search': 'https://dummyjson.com/products/search?q=phone' },
      },
    );
    // `?` already present so query-string params append with `&`.
    expect(url.startsWith('https://dummyjson.com/products/search?q=phone&')).toBe(true);
    expect(url).toContain('filter=');
  });

  it('uses urlMap function templates', () => {
    const url = buildRestUrl(
      { source: 'github.repo.list' },
      {
        urlMap: {
          'github.repo.list': (b) => `https://api.github.com/${b.source.replaceAll('.', '/')}`,
        },
      },
    );
    expect(url).toBe('https://api.github.com/github/repo/list');
  });

  it('throws when no template matches and no baseUrl is configured', () => {
    expect(() => buildRestUrl({ source: 'unknown' }, {})).toThrow(/no URL mapping/u);
  });

  it('appends filter / sort / group_by as query string parameters', () => {
    const url = buildRestUrl(
      { source: 'list', filter: 'a = 1', sort: 'b desc', group_by: 'c' },
      { baseUrl: 'https://api.test/' },
    );
    expect(url).toContain('filter=');
    expect(url).toContain('sort=');
    expect(url).toContain('group_by=c');
  });

  it('GETs the built URL and returns parsed JSON', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ products: [{ id: 1, title: 'iPhone' }] }));
    const resolver = new RestDataResolver({
      baseUrl: 'https://dummyjson.com/',
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const result = await resolver.resolve({ source: 'products' });
    expect(result).toEqual({ products: [{ id: 1, title: 'iPhone' }] });
    const call = fetchImpl.mock.calls[0]!;
    expect(call[0]).toBe('https://dummyjson.com/products');
    const init = call[1] as { headers: Record<string, string> };
    expect(init.headers['accept']).toBe('application/json');
  });

  it('throws on non-2xx responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    const resolver = new RestDataResolver({
      baseUrl: 'https://api.test/',
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await expect(resolver.resolve({ source: 'x' })).rejects.toThrow(/HTTP 500/u);
  });

  it('merges static headers with headerProvider output (provider wins)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const resolver = new RestDataResolver({
      baseUrl: 'https://api.test/',
      headers: { authorization: 'static', 'x-trace': 't1' },
      headerProvider: () => ({ authorization: 'dynamic' }),
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await resolver.resolve({ source: 'x' });
    const call = fetchImpl.mock.calls[0]!;
    const init = call[1] as { headers: Record<string, string> };
    expect(init.headers['authorization']).toBe('dynamic');
    expect(init.headers['x-trace']).toBe('t1');
    expect(init.headers['accept']).toBe('application/json');
  });

  it('applies a transform to the parsed body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [1, 2, 3] }));
    const resolver = new RestDataResolver({
      baseUrl: 'https://api.test/',
      fetch: fetchImpl as unknown as typeof fetch,
      transform: (json) => (json as { data: number[] }).data,
    });
    expect(await resolver.resolve({ source: 'x' })).toEqual([1, 2, 3]);
  });

  it('substitutes ${filter} / ${sort} / ${group_by} in URL templates', () => {
    const url = buildRestUrl(
      { source: 'x', filter: 'a = 1', sort: 'b' },
      {
        urlMap: {
          x: 'https://api.test/run/${filter}/${sort}/${group_by}',
        },
      },
    );
    expect(url).toContain('/run/a%20%3D%201/b/');
  });
});
