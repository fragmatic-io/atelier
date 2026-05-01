// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

import { describe, expect, it, vi } from 'vitest';
import { GraphQLDataResolver, defaultFieldName } from '../src/graphql.js';
import type { Capability } from '@cir/schemas';

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function makeCap(): Capability {
  return {
    id: 'shop.product.list',
    kind: 'data',
    version: '0.1.0',
    input: {},
    output: {
      products: 'array<{ id: number, title: string, description: string, price: number }>',
      total: 'number',
    },
    side_effects: ['reads:catalog'],
    permissions: ['catalog:read'],
    confirmation: 'none',
    reversible: true,
  };
}

describe('defaultFieldName', () => {
  it('camelCases dotted ids', () => {
    expect(defaultFieldName('shop.product.list')).toBe('shopProductList');
    expect(defaultFieldName('flat')).toBe('flat');
  });
});

describe('GraphQLDataResolver', () => {
  it('builds a query with no args when binding has no filter/sort/group_by', () => {
    const resolver = new GraphQLDataResolver({
      endpoint: 'https://gql.test',
      capabilities: { 'shop.product.list': makeCap() },
    });
    const { query, variables } = resolver.buildQuery({ source: 'shop.product.list' });
    expect(variables).toEqual({});
    expect(query).toContain('shopProductList');
    expect(query).toContain('products { id }');
    expect(query).not.toContain('$filter');
  });

  it('binds filter / sort / group_by as variables', () => {
    const resolver = new GraphQLDataResolver({
      endpoint: 'https://gql.test',
      capabilities: { 'shop.product.list': makeCap() },
    });
    const { query, variables } = resolver.buildQuery({
      source: 'shop.product.list',
      filter: 'a = 1',
      sort: 'b desc',
      group_by: 'c',
    });
    expect(typeof variables['filter']).toBe('string');
    expect(variables['sort']).toBe('b desc');
    expect(variables['groupBy']).toBe('c');
    expect(query).toContain('$filter: String');
    expect(query).toContain('$sort: String');
    expect(query).toContain('$groupBy: String');
    expect(query).toContain('filter: $filter');
  });

  it('passes through unparseable filters verbatim in the variables map', () => {
    const resolver = new GraphQLDataResolver({ endpoint: 'https://gql.test' });
    const { variables } = resolver.buildQuery({ source: 'x', filter: '## bad ## syntax' });
    expect(variables['filter']).toBe('## bad ## syntax');
  });

  it('uses fieldMap overrides when present', () => {
    const resolver = new GraphQLDataResolver({
      endpoint: 'https://gql.test',
      fieldMap: { 'shop.product.list': 'allProducts' },
    });
    const { query } = resolver.buildQuery({ source: 'shop.product.list' });
    expect(query).toContain('allProducts');
  });

  it('uses queryFor override when supplied', () => {
    const resolver = new GraphQLDataResolver({
      endpoint: 'https://gql.test',
      queryFor: () => ({ query: 'query Z { z }', variables: { extra: 1 } }),
    });
    const out = resolver.buildQuery({ source: 'whatever' });
    expect(out).toEqual({ query: 'query Z { z }', variables: { extra: 1 } });
  });

  it('POSTs JSON to the endpoint and unwraps the named field', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { shopProductList: { products: [{ id: 1 }], total: 1 } } }),
      );
    const resolver = new GraphQLDataResolver({
      endpoint: 'https://gql.test',
      capabilities: { 'shop.product.list': makeCap() },
      fetch: fetchImpl,
    });
    const result = await resolver.resolve({ source: 'shop.product.list' });
    expect(result).toEqual({ products: [{ id: 1 }], total: 1 });
    const call = fetchImpl.mock.calls[0]!;
    expect(call[0]).toBe('https://gql.test');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
  });

  it('throws when the endpoint returns a non-2xx status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));
    const resolver = new GraphQLDataResolver({
      endpoint: 'https://gql.test',
      fetch: fetchImpl,
    });
    await expect(resolver.resolve({ source: 'shop.product.list' })).rejects.toThrow(/HTTP 503/u);
  });

  it('throws when the body contains GraphQL errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ errors: [{ message: 'bad' }] }));
    const resolver = new GraphQLDataResolver({
      endpoint: 'https://gql.test',
      fetch: fetchImpl,
    });
    await expect(resolver.resolve({ source: 'shop.product.list' })).rejects.toThrow(
      /server returned errors/u,
    );
  });

  it('returns undefined when the body has no data field', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const resolver = new GraphQLDataResolver({
      endpoint: 'https://gql.test',
      fetch: fetchImpl,
    });
    const out = await resolver.resolve({ source: 'shop.product.list' });
    expect(out).toBeUndefined();
  });

  it('merges static + dynamic headers (provider wins)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { x: 1 } }));
    const resolver = new GraphQLDataResolver({
      endpoint: 'https://gql.test',
      fieldMap: { x: 'x' },
      headers: { authorization: 'static' },
      headerProvider: () => ({ authorization: 'dynamic', 'x-trace': 't' }),
      fetch: fetchImpl,
    });
    await resolver.resolve({ source: 'x' });
    const init = fetchImpl.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(init.headers['authorization']).toBe('dynamic');
    expect(init.headers['x-trace']).toBe('t');
    expect(init.headers['content-type']).toBe('application/json');
  });
});
