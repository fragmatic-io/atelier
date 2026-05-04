// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the action-dispatch rate limiter.
 *
 * Surface tested:
 *   - `parseRateLimit` — accepts canonical `<count>/<unit>/<scope>` and
 *     rejects malformed inputs.
 *   - `NoopRateLimiter` — always allows; remaining = +Infinity.
 *   - `InMemoryRateLimiter` — token-bucket with per-(tenant, user, capability)
 *     keys, refill, denial, and bucket reuse with rate updates.
 */

import { describe, expect, it } from 'vitest';
import {
  InMemoryRateLimiter,
  NoopRateLimiter,
  parseRateLimit,
} from '../../src/actions/rate-limiter.js';

describe('parseRateLimit', () => {
  it('parses canonical specs', () => {
    expect(parseRateLimit('100/min/user')).toEqual({ count: 100, window_ms: 60_000 });
    expect(parseRateLimit('5/sec/user')).toEqual({ count: 5, window_ms: 1_000 });
    expect(parseRateLimit('60/hour/org')).toEqual({ count: 60, window_ms: 3_600_000 });
    expect(parseRateLimit('1000/day/global')).toEqual({ count: 1000, window_ms: 86_400_000 });
  });

  it('returns null on malformed input', () => {
    expect(parseRateLimit('100')).toBeNull();
    expect(parseRateLimit('100/min')).toBeNull();
    expect(parseRateLimit('abc/min/user')).toBeNull();
    expect(parseRateLimit('100/century/user')).toBeNull();
    expect(parseRateLimit('100/min/squad')).toBeNull();
  });

  it('rejects zero / negative counts', () => {
    expect(parseRateLimit('0/min/user')).toBeNull();
  });
});

describe('NoopRateLimiter', () => {
  it('always allows with +Infinity remaining', async () => {
    const r = await NoopRateLimiter.check({
      user_id: 'u1',
      capability_id: 'thread.read',
      rate_limit: '5/sec/user',
    });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(Number.POSITIVE_INFINITY);
    expect(r.reset_at).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('InMemoryRateLimiter', () => {
  it('seeds a fresh bucket at full capacity and consumes one token per check', async () => {
    const now = 1_700_000_000_000;
    const lim = new InMemoryRateLimiter({ now: () => now });
    const r1 = await lim.check({
      user_id: 'u1',
      capability_id: 'send.email',
      rate_limit: '3/sec/user',
    });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    const r2 = await lim.check({
      user_id: 'u1',
      capability_id: 'send.email',
      rate_limit: '3/sec/user',
    });
    expect(r2.remaining).toBe(1);
    const r3 = await lim.check({
      user_id: 'u1',
      capability_id: 'send.email',
      rate_limit: '3/sec/user',
    });
    expect(r3.remaining).toBe(0);
  });

  it('denies further requests once the bucket is empty and surfaces a reset_at in the future', async () => {
    const now = 1_700_000_000_000;
    const lim = new InMemoryRateLimiter({ now: () => now });
    for (let i = 0; i < 3; i += 1) {
      await lim.check({
        user_id: 'u1',
        capability_id: 'send.email',
        rate_limit: '3/sec/user',
      });
    }
    const denied = await lim.check({
      user_id: 'u1',
      capability_id: 'send.email',
      rate_limit: '3/sec/user',
    });
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(new Date(denied.reset_at).getTime()).toBeGreaterThan(now);
  });

  it('refills tokens over time and re-permits a previously denied caller', async () => {
    let now = 1_700_000_000_000;
    const lim = new InMemoryRateLimiter({ now: () => now });
    for (let i = 0; i < 5; i += 1) {
      await lim.check({
        user_id: 'u1',
        capability_id: 'send.email',
        rate_limit: '5/sec/user',
      });
    }
    // Bucket now empty; advance 1 second → refilled.
    now += 1_000;
    const r = await lim.check({
      user_id: 'u1',
      capability_id: 'send.email',
      rate_limit: '5/sec/user',
    });
    expect(r.allowed).toBe(true);
  });

  it('isolates buckets per (tenant, user, capability) tuple', async () => {
    const now = 1_700_000_000_000;
    const lim = new InMemoryRateLimiter({ now: () => now });
    // Burn the cap on one user's send.email bucket.
    for (let i = 0; i < 2; i += 1) {
      await lim.check({
        user_id: 'u1',
        capability_id: 'send.email',
        rate_limit: '2/sec/user',
      });
    }
    // u1 is denied …
    expect(
      (
        await lim.check({
          user_id: 'u1',
          capability_id: 'send.email',
          rate_limit: '2/sec/user',
        })
      ).allowed,
    ).toBe(false);
    // … u2 is fresh.
    expect(
      (
        await lim.check({
          user_id: 'u2',
          capability_id: 'send.email',
          rate_limit: '2/sec/user',
        })
      ).allowed,
    ).toBe(true);
    // Different tenant for the same user — also fresh.
    expect(
      (
        await lim.check({
          tenant_id: 't2',
          user_id: 'u1',
          capability_id: 'send.email',
          rate_limit: '2/sec/user',
        })
      ).allowed,
    ).toBe(true);
    // Different capability for the same user — fresh again.
    expect(
      (
        await lim.check({
          user_id: 'u1',
          capability_id: 'thread.read',
          rate_limit: '2/sec/user',
        })
      ).allowed,
    ).toBe(true);
    expect(lim.bucketCount()).toBeGreaterThanOrEqual(4);
  });

  it('caps refill at the bucket capacity (no over-fill)', async () => {
    let now = 1_700_000_000_000;
    const lim = new InMemoryRateLimiter({ now: () => now });
    await lim.check({
      user_id: 'u1',
      capability_id: 'a',
      rate_limit: '2/sec/user',
    });
    // Advance an hour — refill clamped to capacity (2), so we still see
    // exactly 2 admittances before denial.
    now += 60 * 60 * 1_000;
    expect(
      (
        await lim.check({
          user_id: 'u1',
          capability_id: 'a',
          rate_limit: '2/sec/user',
        })
      ).allowed,
    ).toBe(true);
    expect(
      (
        await lim.check({
          user_id: 'u1',
          capability_id: 'a',
          rate_limit: '2/sec/user',
        })
      ).allowed,
    ).toBe(true);
    expect(
      (
        await lim.check({
          user_id: 'u1',
          capability_id: 'a',
          rate_limit: '2/sec/user',
        })
      ).allowed,
    ).toBe(false);
  });

  it('fails open with +Infinity remaining when rate_limit string is malformed', async () => {
    const lim = new InMemoryRateLimiter();
    const r = await lim.check({
      user_id: 'u1',
      capability_id: 'send.email',
      rate_limit: 'not-a-rate-limit',
    });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it('reset() drops all buckets', async () => {
    const lim = new InMemoryRateLimiter();
    await lim.check({
      user_id: 'u1',
      capability_id: 'a',
      rate_limit: '5/sec/user',
    });
    expect(lim.bucketCount()).toBe(1);
    lim.reset();
    expect(lim.bucketCount()).toBe(0);
  });
});
