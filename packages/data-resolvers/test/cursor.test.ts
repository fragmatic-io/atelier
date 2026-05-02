// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the cursor pagination protocol (Wave 10 / S-2).
 *
 * Covers: type guard semantics, `paginate()` walking a paginated resolver,
 * back-compat with legacy array resolvers, and the `maxPages` safety valve.
 */

import { describe, expect, it } from 'vitest';
import { isCursorPaginatedResult, paginate } from '../src/cursor.js';
import type { DataBinding } from '../src/types.js';

describe('isCursorPaginatedResult', () => {
  it('returns true for { items: [...] } shapes', () => {
    expect(isCursorPaginatedResult({ items: [] })).toBe(true);
    expect(isCursorPaginatedResult({ items: [1, 2, 3], next_cursor: 'abc' })).toBe(true);
  });

  it('returns false for plain arrays', () => {
    expect(isCursorPaginatedResult([1, 2, 3])).toBe(false);
  });

  it('returns false for null / undefined / scalars', () => {
    expect(isCursorPaginatedResult(null)).toBe(false);
    expect(isCursorPaginatedResult(undefined)).toBe(false);
    expect(isCursorPaginatedResult(42)).toBe(false);
    expect(isCursorPaginatedResult('abc')).toBe(false);
  });

  it('returns false for objects without an items array', () => {
    expect(isCursorPaginatedResult({ next_cursor: 'a' })).toBe(false);
    expect(isCursorPaginatedResult({ items: 'not an array' })).toBe(false);
  });
});

describe('paginate', () => {
  it('walks a cursor-paginated resolver to completion', async () => {
    // Three pages of 2 items each, then exhaustion.
    const pages: Record<string, { items: number[]; next_cursor?: string }> = {
      __first__: { items: [1, 2], next_cursor: 'p2' },
      p2: { items: [3, 4], next_cursor: 'p3' },
      p3: { items: [5, 6] }, // no next_cursor → terminal
    };
    const seen: (string | undefined)[] = [];
    const resolver = (b: DataBinding): unknown => {
      seen.push(b.cursor);
      const key = b.cursor ?? '__first__';
      return pages[key]!;
    };

    const out = await paginate<number>(resolver, { source: 'list' });
    expect(out).toEqual([1, 2, 3, 4, 5, 6]);
    // First call has no cursor; subsequent calls thread next_cursor.
    expect(seen).toEqual([undefined, 'p2', 'p3']);
  });

  it('threads pagination=cursor on the binding when not already set', async () => {
    let observed: DataBinding | null = null;
    const resolver = (b: DataBinding): unknown => {
      observed = b;
      return { items: [], next_cursor: undefined };
    };
    await paginate(resolver, { source: 'x' });
    expect(observed).not.toBeNull();
    expect((observed as unknown as DataBinding).pagination).toBe('cursor');
  });

  it('preserves an explicit pagination mode set by the caller', async () => {
    let observed: DataBinding | null = null;
    const resolver = (b: DataBinding): unknown => {
      observed = b;
      return { items: [1] };
    };
    await paginate(resolver, { source: 'x', pagination: 'offset' });
    expect(observed).not.toBeNull();
    expect((observed as unknown as DataBinding).pagination).toBe('offset');
  });

  it('treats a plain array return as a one-shot legacy result', async () => {
    const resolver = (): unknown => [1, 2, 3];
    const out = await paginate<number>(resolver, { source: 'legacy' });
    expect(out).toEqual([1, 2, 3]);
  });

  it('returns an empty array when the resolver returns undefined', async () => {
    const resolver = (): unknown => undefined;
    const out = await paginate(resolver, { source: 'missing' });
    expect(out).toEqual([]);
  });

  it('returns an empty array when the resolver returns an unknown shape', async () => {
    // A resolver that returns a non-array, non-paginated object — we exit
    // safely without iterating forever.
    const resolver = (): unknown => ({ not: 'paginated' });
    const out = await paginate(resolver, { source: 'weird' });
    expect(out).toEqual([]);
  });

  it('caps iteration at maxPages (safety valve)', async () => {
    let calls = 0;
    // A misbehaving resolver that always issues another cursor — without a
    // cap we'd loop forever.
    const resolver = (): unknown => {
      calls += 1;
      return { items: [calls], next_cursor: `p${String(calls + 1)}` };
    };
    const out = await paginate<number>(resolver, { source: 'never_ends' }, { maxPages: 5 });
    expect(out.length).toBe(5);
    expect(calls).toBe(5);
  });

  it('honours an explicit limit on the binding (forwarded verbatim)', async () => {
    let observedLimit: number | undefined;
    const resolver = (b: DataBinding): unknown => {
      observedLimit = b.limit;
      return { items: [], next_cursor: undefined };
    };
    await paginate(resolver, { source: 'x', limit: 25 });
    expect(observedLimit).toBe(25);
  });
});
