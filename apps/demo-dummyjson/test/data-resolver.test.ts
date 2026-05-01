// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * RestDataResolver wiring against a mocked fetch. Confirms the demo's URL
 * map shape: every capability maps to the right `https://dummyjson.com/…`
 * endpoint, and the recommendation transform clips the focal product
 * envelope down to the canonical `{ products, total }` shape.
 */

import { describe, expect, it, vi } from 'vitest';
import { RestDataResolver } from '@cir/data-resolvers';

const DUMMYJSON_BASE = 'https://dummyjson.com';

function buildResolver(fetchImpl: typeof fetch): RestDataResolver {
  return new RestDataResolver({
    fetch: fetchImpl,
    urlMap: {
      'dummyjson.product.list': `${DUMMYJSON_BASE}/products?limit=30`,
      'dummyjson.product.search': (b): string =>
        `${DUMMYJSON_BASE}/products/search?q=${encodeURIComponent(extractQ(b.filter) ?? '')}&limit=30`,
      'dummyjson.product.recommendations': (b): string =>
        `${DUMMYJSON_BASE}/products/${extractEq(b.filter, 'product_id') ?? '1'}`,
      'dummyjson.cart.list': (b): string =>
        `${DUMMYJSON_BASE}/carts/user/${extractEq(b.filter, 'user_id') ?? '1'}`,
    },
    transform: (json, binding) => {
      if (binding.source === 'dummyjson.product.recommendations') {
        const product = json as { category?: string; id?: number };
        return {
          products: product.category ? [product] : [],
          total: product.category ? 1 : 0,
        };
      }
      return json;
    },
  });
}

function extractEq(filter: string | undefined, key: string): string | null {
  if (!filter) return null;
  const re = new RegExp(`${key}\\s*=\\s*"?([\\w-]+)"?`, 'u');
  const m = re.exec(filter);
  return m && m[1] ? m[1] : null;
}
function extractQ(filter: string | undefined): string | null {
  return extractEq(filter, 'q');
}

interface FetchCall {
  url: string;
}

function fakeFetch(
  body: unknown,
  status = 200,
): {
  fn: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    calls.push({ url });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { fn: fn as typeof fetch, calls };
}

describe('dummyjson resolver', () => {
  it('hits /products for product.list', async () => {
    const { fn, calls } = fakeFetch({ products: [{ id: 1, title: 'Test' }], total: 1 });
    const r = buildResolver(fn);
    await r.resolve({ source: 'dummyjson.product.list' });
    expect(calls[0]?.url).toContain('https://dummyjson.com/products');
    expect(calls[0]?.url).toContain('limit=30');
  });

  it('hits /products/search?q=phone for product.search', async () => {
    const { fn, calls } = fakeFetch({ products: [], total: 0 });
    const r = buildResolver(fn);
    await r.resolve({
      source: 'dummyjson.product.search',
      filter: 'q = phone',
    });
    expect(calls[0]?.url).toContain('https://dummyjson.com/products/search?q=phone');
  });

  it('hits /products/{id} for recommendations and clips to the canonical envelope', async () => {
    const { fn, calls } = fakeFetch({
      id: 42,
      title: 'Phone',
      category: 'smartphones',
    });
    const r = buildResolver(fn);
    const result = await r.resolve({
      source: 'dummyjson.product.recommendations',
      filter: 'product_id = 42',
    });
    expect(calls[0]?.url).toContain('https://dummyjson.com/products/42');
    expect(result).toEqual({
      products: [{ id: 42, title: 'Phone', category: 'smartphones' }],
      total: 1,
    });
  });

  it('hits /carts/user/{id} for cart.list', async () => {
    const { fn, calls } = fakeFetch({ products: [], total: 0 });
    const r = buildResolver(fn);
    await r.resolve({
      source: 'dummyjson.cart.list',
      filter: 'user_id = 7',
    });
    expect(calls[0]?.url).toContain('https://dummyjson.com/carts/user/7');
  });

  it('surfaces non-2xx HTTP status as a thrown error', async () => {
    const { fn } = fakeFetch({ error: 'nope' }, 500);
    const r = buildResolver(fn);
    await expect(r.resolve({ source: 'dummyjson.product.list' })).rejects.toThrow(/HTTP 500/u);
  });
});
