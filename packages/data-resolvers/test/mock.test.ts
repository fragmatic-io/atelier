// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

import { describe, expect, it } from 'vitest';
import { MockDataResolver } from '../src/mock.ts';

describe('MockDataResolver', () => {
  it('returns the fixture value for a known capability id', () => {
    const resolver = new MockDataResolver({
      fixtures: { list: [{ id: 1 }, { id: 2 }] },
    });
    expect(resolver.resolve({ source: 'list' })).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('returns undefined for unknown capability ids (composite-friendly)', () => {
    const resolver = new MockDataResolver({ fixtures: {} });
    expect(resolver.resolve({ source: 'unknown' })).toBeUndefined();
  });

  it('accepts a Map as the fixture store', () => {
    const fixtures = new Map([['x', { hello: 'world' }]]);
    const resolver = new MockDataResolver({ fixtures });
    expect(resolver.resolve({ source: 'x' })).toEqual({ hello: 'world' });
  });

  it('invokes function fixtures with the binding', () => {
    const resolver = new MockDataResolver({
      fixtures: { x: (b) => ({ source: b.source, filter: b.filter }) },
    });
    expect(resolver.resolve({ source: 'x', filter: 'a = 1' })).toEqual({
      source: 'x',
      filter: 'a = 1',
    });
  });

  it('applies binding.filter to array fixtures client-side', () => {
    const resolver = new MockDataResolver({
      fixtures: {
        list: [
          { id: 1, status: 'open' },
          { id: 2, status: 'done' },
          { id: 3, status: 'open' },
        ],
      },
    });
    const out = resolver.resolve({ source: 'list', filter: 'status = "open"' });
    expect(out).toEqual([
      { id: 1, status: 'open' },
      { id: 3, status: 'open' },
    ]);
  });

  it('applies binding.sort with asc/desc', () => {
    const resolver = new MockDataResolver({
      fixtures: { list: [{ n: 3 }, { n: 1 }, { n: 2 }] },
    });
    expect(resolver.resolve({ source: 'list', sort: 'n asc' })).toEqual([
      { n: 1 },
      { n: 2 },
      { n: 3 },
    ]);
    expect(resolver.resolve({ source: 'list', sort: 'n desc' })).toEqual([
      { n: 3 },
      { n: 2 },
      { n: 1 },
    ]);
  });

  it('groups by binding.group_by into a record of buckets', () => {
    const resolver = new MockDataResolver({
      fixtures: {
        list: [
          { id: 1, status: 'open' },
          { id: 2, status: 'done' },
          { id: 3, status: 'open' },
        ],
      },
    });
    const out = resolver.resolve({ source: 'list', group_by: 'status' });
    expect(out).toEqual({
      open: [
        { id: 1, status: 'open' },
        { id: 3, status: 'open' },
      ],
      done: [{ id: 2, status: 'done' }],
    });
  });

  it('skips client-side binding application when applyBindingClientSide is false', () => {
    const resolver = new MockDataResolver({
      fixtures: { list: [{ a: 1 }, { a: 2 }] },
      applyBindingClientSide: false,
    });
    expect(resolver.resolve({ source: 'list', filter: 'a = 1' })).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('passes non-array fixtures through without filtering', () => {
    const resolver = new MockDataResolver({
      fixtures: { profile: { name: 'demo' } },
    });
    expect(resolver.resolve({ source: 'profile', filter: 'a = 1' })).toEqual({
      name: 'demo',
    });
  });

  it('ignores unparseable filters (returns the array as-is)', () => {
    const resolver = new MockDataResolver({
      fixtures: { list: [{ a: 1 }, { a: 2 }] },
    });
    expect(resolver.resolve({ source: 'list', filter: '## bad' })).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('group_by bucketizes numeric, boolean, and missing keys without producing [object Object]', () => {
    const resolver = new MockDataResolver({
      fixtures: {
        list: [
          { id: 1, count: 1, active: true },
          { id: 2, count: 2, active: false },
          { id: 3, count: 1, active: true },
          { id: 4 },
        ],
      },
    });
    const byCount = resolver.resolve({ source: 'list', group_by: 'count' }) as Record<
      string,
      unknown[]
    >;
    expect(Object.keys(byCount).sort()).toEqual(['', '1', '2']);
    expect(byCount['1']).toHaveLength(2);

    const byActive = resolver.resolve({ source: 'list', group_by: 'active' }) as Record<
      string,
      unknown[]
    >;
    expect(byActive['true']).toHaveLength(2);
    expect(byActive['false']).toHaveLength(1);
    expect(byActive['']).toHaveLength(1);
  });

  it('group_by JSON-encodes nested object bucket values', () => {
    const resolver = new MockDataResolver({
      fixtures: {
        list: [
          { id: 1, owner: { team: 'a' } },
          { id: 2, owner: { team: 'b' } },
          { id: 3, owner: { team: 'a' } },
        ],
      },
    });
    const grouped = resolver.resolve({ source: 'list', group_by: 'owner' }) as Record<
      string,
      unknown[]
    >;
    expect(Object.keys(grouped).sort()).toEqual(['{"team":"a"}', '{"team":"b"}']);
    expect(grouped['{"team":"a"}']).toHaveLength(2);
  });

  it('sort handles missing fields by pushing them to the end and is a no-op on malformed input', () => {
    const resolver = new MockDataResolver({
      fixtures: {
        list: [{ id: 1, n: 2 }, { id: 2 }, { id: 3, n: 1 }],
      },
    });
    const sorted = resolver.resolve({ source: 'list', sort: 'n asc' }) as { id: number }[];
    expect(sorted.map((r) => r.id)).toEqual([3, 1, 2]);

    const original = resolver.resolve({ source: 'list', sort: '!!!' }) as { id: number }[];
    expect(original).toHaveLength(3);
  });
});
