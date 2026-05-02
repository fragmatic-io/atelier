// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `MemoryScopingCache` and the `hashIntent` helper. We assert:
 *
 *   - get/set roundtrip
 *   - distinct keys (different userId / appId / route / intentHash) are
 *     independent slots
 *   - LRU eviction kicks in past `maxEntries`
 *   - TTL drops stale entries on read
 *   - `evictMatching` returns the count and prunes correctly
 *   - `hashIntent` is deterministic, length-stable, distinguishes near-
 *     identical inputs
 */

import { describe, expect, it } from 'vitest';
import { MemoryScopingCache, hashIntent, type ScopingCacheKey } from '../src/cache.js';

function key(overrides: Partial<ScopingCacheKey> = {}): ScopingCacheKey {
  return {
    userId: 'u1',
    appId: 'a1',
    route: '/today',
    intentHash: 'abc12345',
    ...overrides,
  };
}

describe('MemoryScopingCache', () => {
  it('round-trips set/get', () => {
    const c = new MemoryScopingCache();
    c.set(key(), { refs: [{ id: 'thread.archive' }], storedAt: 100 });
    expect(c.get(key())?.refs).toEqual([{ id: 'thread.archive' }]);
  });

  it('returns null for unset keys', () => {
    expect(new MemoryScopingCache().get(key())).toBeNull();
  });

  it('keys distinguish on every field', () => {
    const c = new MemoryScopingCache();
    c.set(key(), { refs: [{ id: 'a' }], storedAt: 0 });
    expect(c.get(key({ userId: 'u2' }))).toBeNull();
    expect(c.get(key({ appId: 'a2' }))).toBeNull();
    expect(c.get(key({ route: '/other' }))).toBeNull();
    expect(c.get(key({ intentHash: 'deadbeef' }))).toBeNull();
  });

  it('LRU-evicts past maxEntries', () => {
    const c = new MemoryScopingCache({ maxEntries: 2 });
    c.set(key({ route: '/a' }), { refs: [], storedAt: 0 });
    c.set(key({ route: '/b' }), { refs: [], storedAt: 0 });
    c.set(key({ route: '/c' }), { refs: [], storedAt: 0 });
    expect(c.get(key({ route: '/a' }))).toBeNull(); // oldest evicted
    expect(c.get(key({ route: '/b' }))).not.toBeNull();
    expect(c.get(key({ route: '/c' }))).not.toBeNull();
  });

  it('touches on get (LRU recency)', () => {
    const c = new MemoryScopingCache({ maxEntries: 2 });
    c.set(key({ route: '/a' }), { refs: [], storedAt: 0 });
    c.set(key({ route: '/b' }), { refs: [], storedAt: 0 });
    // Touch /a so /b becomes the LRU.
    c.get(key({ route: '/a' }));
    c.set(key({ route: '/c' }), { refs: [], storedAt: 0 });
    expect(c.get(key({ route: '/a' }))).not.toBeNull();
    expect(c.get(key({ route: '/b' }))).toBeNull();
  });

  it('drops entries past TTL on read', () => {
    let now = 1000;
    const c = new MemoryScopingCache({ ttlMs: 100, now: () => now });
    c.set(key(), { refs: [{ id: 'a' }], storedAt: now });
    expect(c.get(key())).not.toBeNull();
    now += 50;
    expect(c.get(key())).not.toBeNull();
    now += 60;
    expect(c.get(key())).toBeNull();
  });

  it('evictMatching prunes by predicate and returns the count', () => {
    const c = new MemoryScopingCache();
    c.set(key({ route: '/a' }), { refs: [], storedAt: 0 });
    c.set(key({ route: '/b' }), { refs: [], storedAt: 0 });
    c.set(key({ route: '/c' }), { refs: [], storedAt: 0 });
    const dropped = c.evictMatching((k) => k.route !== '/a');
    expect(dropped).toBe(2);
    expect(c.get(key({ route: '/a' }))).not.toBeNull();
    expect(c.get(key({ route: '/b' }))).toBeNull();
    expect(c.get(key({ route: '/c' }))).toBeNull();
  });

  it('overwrites existing entries on re-set', () => {
    const c = new MemoryScopingCache();
    c.set(key(), { refs: [{ id: 'old' }], storedAt: 0 });
    c.set(key(), { refs: [{ id: 'new' }], storedAt: 0 });
    expect(c.get(key())?.refs[0]?.id).toBe('new');
    expect(c.size()).toBe(1);
  });
});

describe('hashIntent', () => {
  it('is deterministic', () => {
    expect(hashIntent('archive a thread')).toBe(hashIntent('archive a thread'));
  });

  it('returns 8 hex chars', () => {
    const h = hashIntent('anything');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it('distinguishes near-identical inputs', () => {
    expect(hashIntent('archive thread')).not.toBe(hashIntent('archive threads'));
    expect(hashIntent('list')).not.toBe(hashIntent('lists'));
    expect(hashIntent('a')).not.toBe(hashIntent('b'));
  });

  it('handles empty input', () => {
    expect(hashIntent('')).toMatch(/^[0-9a-f]{8}$/);
  });
});
