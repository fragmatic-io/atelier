// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

import { describe, expect, it, vi } from 'vitest';
import { withCache } from '../src/cache.js';
import type { DataBinding } from '../src/types.js';

function makeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('withCache', () => {
  it('returns the resolver value on first call and caches subsequent calls within TTL', async () => {
    const clock = makeClock();
    const inner = vi.fn().mockResolvedValue({ ok: true });
    const cached = withCache(inner, { ttlMs: 100, now: clock.now });

    const a = await cached({ source: 'x' });
    const b = await cached({ source: 'x' });
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('produces distinct cache entries for different bindings', async () => {
    const inner = vi.fn().mockImplementation((b: DataBinding) => Promise.resolve({ s: b.source }));
    const cached = withCache(inner, { ttlMs: 100 });
    await cached({ source: 'a' });
    await cached({ source: 'b' });
    expect(inner).toHaveBeenCalledTimes(2);
    expect(cached.size()).toBe(2);
  });

  it('on TTL miss with staleWhileRevalidate=false, refetches synchronously', async () => {
    const clock = makeClock();
    const inner = vi.fn().mockResolvedValue({ n: 1 });
    const cached = withCache(inner, {
      ttlMs: 100,
      staleWhileRevalidate: false,
      now: clock.now,
    });
    await cached({ source: 'x' });
    clock.advance(101);
    inner.mockResolvedValueOnce({ n: 2 });
    const v = await cached({ source: 'x' });
    expect(v).toEqual({ n: 2 });
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('on TTL miss with staleWhileRevalidate=true, returns stale and revalidates in background', async () => {
    const clock = makeClock();
    const inner = vi.fn().mockResolvedValueOnce({ n: 1 }).mockResolvedValueOnce({ n: 2 });
    const cached = withCache(inner, {
      ttlMs: 100,
      staleWhileRevalidate: true,
      now: clock.now,
    });
    await cached({ source: 'x' });
    clock.advance(101);
    const stale = await cached({ source: 'x' });
    expect(stale).toEqual({ n: 1 });
    // Allow background promise to flush.
    await new Promise((r) => setTimeout(r, 0));
    const fresh = await cached({ source: 'x' });
    expect(fresh).toEqual({ n: 2 });
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('preserves stale value on revalidation error', async () => {
    const clock = makeClock();
    const inner = vi.fn().mockResolvedValueOnce({ n: 1 }).mockRejectedValueOnce(new Error('flap'));
    const cached = withCache(inner, {
      ttlMs: 100,
      staleWhileRevalidate: true,
      now: clock.now,
    });
    await cached({ source: 'x' });
    clock.advance(101);
    const a = await cached({ source: 'x' });
    expect(a).toEqual({ n: 1 });
    // Background revalidation rejects; let it settle.
    await new Promise((r) => setTimeout(r, 0));
    // Next call within the bumped expiry window still gets the stale value.
    const b = await cached({ source: 'x' });
    expect(b).toEqual({ n: 1 });
  });

  it('dedupes concurrent revalidations into a single in-flight request', async () => {
    const clock = makeClock();
    let resolveInner!: (v: unknown) => void;
    const inner = vi.fn().mockImplementation(async () => {
      // First call resolves immediately.
      if (inner.mock.calls.length === 1) return { n: 1 };
      // Second call (revalidation) is gated by an external resolver.
      return new Promise((r) => {
        resolveInner = r;
      });
    });
    const cached = withCache(inner, {
      ttlMs: 100,
      staleWhileRevalidate: true,
      now: clock.now,
    });
    await cached({ source: 'x' });
    clock.advance(101);
    const a = await cached({ source: 'x' });
    const b = await cached({ source: 'x' });
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    // Only one revalidation should have started.
    expect(inner).toHaveBeenCalledTimes(2);
    resolveInner({ n: 2 });
    await new Promise((r) => setTimeout(r, 0));
  });

  it('invalidate() drops a single binding', async () => {
    const inner = vi.fn().mockResolvedValue({ ok: true });
    const cached = withCache(inner, { ttlMs: 60_000 });
    await cached({ source: 'x' });
    expect(cached.invalidate({ source: 'x' })).toBe(true);
    expect(cached.invalidate({ source: 'x' })).toBe(false);
    await cached({ source: 'x' });
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('clear() empties the cache and reports the prior size', async () => {
    const inner = vi.fn().mockResolvedValue({ ok: true });
    const cached = withCache(inner, { ttlMs: 60_000 });
    await cached({ source: 'a' });
    await cached({ source: 'b' });
    expect(cached.clear()).toBe(2);
    expect(cached.size()).toBe(0);
  });

  it('peek() returns undefined for unseen bindings and an entry for cached ones', async () => {
    const inner = vi.fn().mockResolvedValue('v');
    const cached = withCache(inner);
    expect(cached.peek({ source: 'x' })).toBeUndefined();
    await cached({ source: 'x' });
    expect(cached.peek({ source: 'x' })?.value).toBe('v');
  });

  it('keyOf override partitions the cache differently', async () => {
    const inner = vi.fn().mockResolvedValue('v');
    const cached = withCache(inner, {
      ttlMs: 60_000,
      keyOf: (b) => b.source.toLowerCase(),
    });
    await cached({ source: 'X' });
    await cached({ source: 'x' });
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('binding with filter/sort/group_by produces a distinct cache key from the bare source', async () => {
    const inner = vi.fn().mockResolvedValue('v');
    const cached = withCache(inner, { ttlMs: 60_000 });
    await cached({ source: 'x' });
    await cached({ source: 'x', filter: 'a = 1' });
    await cached({ source: 'x', sort: 'a' });
    await cached({ source: 'x', group_by: 'a' });
    expect(inner).toHaveBeenCalledTimes(4);
    expect(cached.size()).toBe(4);
  });
});
