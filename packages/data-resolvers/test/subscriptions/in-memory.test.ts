// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `InMemorySubscriptionResolver` (Wave 10 / S-3).
 *
 * Covers:
 *  - factory-driven async iteration round-trips items
 *  - per-binding factory routing (returns undefined for unmapped sources)
 *  - resolve() snapshot path (default undefined; explicit when configured)
 *  - the resolver satisfies the `DataResolver` protocol shape
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createInMemorySubscriptionResolver,
  InMemorySubscriptionResolver,
} from '../../src/subscriptions/in-memory.js';
import type { DataBinding } from '../../src/types.js';

/**
 * Build a small async iterable from a list of items. Used in lieu of an
 * `async function*` so we don't trip `@typescript-eslint/require-await`
 * for fixtures that don't actually await anything internally.
 */
function asyncFrom<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      let i = 0;
      return {
        next(): Promise<IteratorResult<T>> {
          if (i >= items.length) return Promise.resolve({ value: undefined, done: true });
          return Promise.resolve({ value: items[i++]!, done: false });
        },
      };
    },
  };
}

describe('createInMemorySubscriptionResolver', () => {
  it('round-trips items from the factory iterable', async () => {
    const resolver = createInMemorySubscriptionResolver({
      factory: () => asyncFrom([1, 2, 3]),
    });
    const stream = resolver.subscribe!({ source: 'numbers' });
    expect(stream).toBeDefined();
    const seen: unknown[] = [];
    for await (const item of stream!) seen.push(item);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('routes per-binding via the factory (undefined opts the binding out)', () => {
    const resolver = createInMemorySubscriptionResolver({
      factory: (b) => (b.source === 'live' ? asyncFrom(['a']) : undefined),
    });
    expect(resolver.subscribe!({ source: 'live' })).toBeDefined();
    expect(resolver.subscribe!({ source: 'static' })).toBeUndefined();
  });

  it('passes the binding verbatim to the factory', () => {
    const factory = vi.fn(() => asyncFrom<unknown>([]));
    const resolver = createInMemorySubscriptionResolver({ factory });
    const binding: DataBinding = { source: 'x', filter: 'y=1', cursor: 'c' };
    resolver.subscribe!(binding);
    expect(factory).toHaveBeenCalledWith(binding);
  });

  it('returns undefined from resolve() by default', () => {
    const resolver = createInMemorySubscriptionResolver({ factory: () => undefined });
    expect(resolver({ source: 'x' })).toBeUndefined();
  });

  it('returns the snapshot from resolve() when configured', () => {
    const resolver = createInMemorySubscriptionResolver({
      factory: () => undefined,
      snapshot: (b) => ({ source: b.source, seeded: true }),
    });
    expect(resolver({ source: 'presence' })).toEqual({ source: 'presence', seeded: true });
  });

  it('exposes subscribe as a function on the resolver (DataResolver shape)', () => {
    const resolver = createInMemorySubscriptionResolver({ factory: () => undefined });
    expect(typeof resolver).toBe('function');
    expect(typeof resolver.subscribe).toBe('function');
  });
});

describe('InMemorySubscriptionResolver (class form)', () => {
  it('round-trips items via the class instance', async () => {
    const resolver = new InMemorySubscriptionResolver<number>({
      factory: () => asyncFrom([10, 20]),
    });
    const stream = resolver.subscribe({ source: 'x' });
    expect(stream).toBeDefined();
    const seen: number[] = [];
    for await (const item of stream!) seen.push(item);
    expect(seen).toEqual([10, 20]);
  });

  it('class form resolve() defaults to undefined and honours snapshot', () => {
    const r1 = new InMemorySubscriptionResolver({ factory: () => undefined });
    expect(r1.resolve({ source: 'x' })).toBeUndefined();

    const r2 = new InMemorySubscriptionResolver({
      factory: () => undefined,
      snapshot: () => 'hello',
    });
    expect(r2.resolve({ source: 'x' })).toBe('hello');
  });
});
