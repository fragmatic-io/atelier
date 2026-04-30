// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

import { describe, expect, it, vi } from 'vitest';
import { OpenApiDataResolver, findOperation, specRefFromImportedFrom } from '../src/openapi.ts';
import type { Capability } from '@cir/schemas';

function makeCapability(overrides: Partial<Capability> = {}): Capability {
  return {
    id: 'shop.product.list',
    kind: 'data',
    version: '0.1.0',
    input: {},
    output: {},
    side_effects: ['reads:catalog'],
    permissions: ['catalog:read'],
    confirmation: 'none',
    reversible: true,
    _review: {
      needs: [],
      imported_from: 'openapi:https://example.test/spec.json',
      imported_at: '2026-04-01T00:00:00.000Z',
      importer_version: '0.1.0',
    },
    ...overrides,
  };
}

const SAMPLE_SPEC = {
  servers: [{ url: 'https://api.shop.test' }],
  paths: {
    '/products': {
      get: {
        operationId: 'shop.product.list',
        responses: { '200': { description: 'ok' } },
      },
    },
    '/products/{id}': {
      get: { operationId: 'shop.product.get', responses: { '200': { description: 'ok' } } },
    },
  },
};

describe('specRefFromImportedFrom', () => {
  it('strips the openapi: prefix', () => {
    expect(specRefFromImportedFrom('openapi:/tmp/spec.json')).toBe('/tmp/spec.json');
  });
  it('passes other refs through unchanged', () => {
    expect(specRefFromImportedFrom('https://x/spec.json')).toBe('https://x/spec.json');
  });
});

describe('findOperation', () => {
  it('matches by exact operationId', () => {
    expect(findOperation(SAMPLE_SPEC, 'shop.product.list')).toEqual({
      method: 'get',
      path: '/products',
    });
  });
  it('matches by underscore-substituted operationId', () => {
    const spec = {
      paths: {
        '/x': { get: { operationId: 'shop_product_list' } },
      },
    };
    expect(findOperation(spec, 'shop.product.list')).toEqual({ method: 'get', path: '/x' });
  });
  it('falls back to a path-segment heuristic when operationId is absent', () => {
    const spec = {
      paths: {
        '/products/list': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    expect(findOperation(spec, 'shop.product.list')).toEqual({
      method: 'get',
      path: '/products/list',
    });
  });
  it('returns undefined when no operation can be matched', () => {
    expect(findOperation({ paths: {} }, 'unknown')).toBeUndefined();
  });
});

describe('OpenApiDataResolver', () => {
  it('resolves by loading the spec, locating the operation, and fetching the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ products: [{ id: 1 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const specLoader = vi.fn().mockResolvedValue(SAMPLE_SPEC);
    const resolver = new OpenApiDataResolver({
      capabilities: { 'shop.product.list': makeCapability() },
      specLoader,
      fetch: fetchImpl,
    });
    const result = await resolver.resolve({ source: 'shop.product.list' });
    expect(result).toEqual({ products: [{ id: 1 }] });
    expect(specLoader).toHaveBeenCalledWith('https://example.test/spec.json');
    expect(fetchImpl).toHaveBeenCalledWith('https://api.shop.test/products', expect.any(Object));
  });

  it('caches specs across resolve calls (loader called once)', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
        ),
      );
    const specLoader = vi.fn().mockResolvedValue(SAMPLE_SPEC);
    const resolver = new OpenApiDataResolver({
      capabilities: { 'shop.product.list': makeCapability() },
      specLoader,
      fetch: fetchImpl,
    });
    await resolver.resolve({ source: 'shop.product.list' });
    await resolver.resolve({ source: 'shop.product.list' });
    expect(specLoader).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws when capability is missing', async () => {
    const resolver = new OpenApiDataResolver({
      capabilities: {},
      specLoader: () => SAMPLE_SPEC,
    });
    await expect(resolver.resolve({ source: 'missing.cap' })).rejects.toThrow(
      /no capability registered/u,
    );
  });

  it('throws when capability has no _review.imported_from', async () => {
    const cap = makeCapability();
    delete cap._review;
    const resolver = new OpenApiDataResolver({
      capabilities: { 'shop.product.list': cap },
      specLoader: () => SAMPLE_SPEC,
    });
    await expect(resolver.resolve({ source: 'shop.product.list' })).rejects.toThrow(
      /imported_from/u,
    );
  });

  it('throws when no matching operation is found in the spec', async () => {
    const resolver = new OpenApiDataResolver({
      capabilities: { 'shop.product.list': makeCapability() },
      specLoader: () => ({ servers: [{ url: 'https://api.x' }], paths: {} }),
    });
    await expect(resolver.resolve({ source: 'shop.product.list' })).rejects.toThrow(
      /no matching operation/u,
    );
  });

  it('uses defaultBaseUrl when the spec has no servers entry', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const resolver = new OpenApiDataResolver({
      capabilities: { 'shop.product.list': makeCapability() },
      specLoader: () => ({ paths: SAMPLE_SPEC.paths }),
      fetch: fetchImpl,
      defaultBaseUrl: 'https://default.test',
    });
    await resolver.resolve({ source: 'shop.product.list' });
    expect(fetchImpl).toHaveBeenCalledWith('https://default.test/products', expect.any(Object));
  });

  it('honors operationMap overrides over operationId discovery', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const resolver = new OpenApiDataResolver({
      capabilities: { 'shop.product.list': makeCapability() },
      specLoader: () => SAMPLE_SPEC,
      operationMap: { 'shop.product.list': { method: 'get', path: '/v2/products' } },
      fetch: fetchImpl,
    });
    await resolver.resolve({ source: 'shop.product.list' });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.shop.test/v2/products', expect.any(Object));
  });

  it('throws when neither spec.servers nor defaultBaseUrl is configured', async () => {
    const resolver = new OpenApiDataResolver({
      capabilities: { 'shop.product.list': makeCapability() },
      specLoader: () => ({ paths: SAMPLE_SPEC.paths }),
    });
    await expect(resolver.resolve({ source: 'shop.product.list' })).rejects.toThrow(
      /defaultBaseUrl/u,
    );
  });

  it('substitutes path parameters from the binding (and leaves unresolved names verbatim)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const resolver = new OpenApiDataResolver({
      capabilities: { 'shop.product.get': makeCapability({ id: 'shop.product.get' }) },
      specLoader: () => SAMPLE_SPEC,
      fetch: fetchImpl,
    });
    // The `id` placeholder won't be on the binding; resolver substitutes the
    // placeholder name itself so the URL remains well-formed.
    await resolver.resolve({ source: 'shop.product.get' });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.shop.test/products/id', expect.any(Object));
  });

  it('does not cache spec loader failures (next call retries)', async () => {
    const specLoader = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(SAMPLE_SPEC);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const resolver = new OpenApiDataResolver({
      capabilities: { 'shop.product.list': makeCapability() },
      specLoader,
      fetch: fetchImpl,
    });
    await expect(resolver.resolve({ source: 'shop.product.list' })).rejects.toThrow(/boom/u);
    await resolver.resolve({ source: 'shop.product.list' });
    expect(specLoader).toHaveBeenCalledTimes(2);
  });
});
