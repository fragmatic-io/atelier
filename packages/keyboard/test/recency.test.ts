// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import { InMemoryRecencyTracker, NoopRecencyTracker } from '../src/recency.js';

describe('InMemoryRecencyTracker', () => {
  it('returns 0 for never-bumped actions', () => {
    const tracker = new InMemoryRecencyTracker({ now: () => 0 });
    expect(tracker.weight('a')).toBe(0);
  });

  it('returns 1 for an action just bumped', () => {
    let now = 0;
    const tracker = new InMemoryRecencyTracker({ now: () => now, halfLifeMs: 1000 });
    tracker.bump('a');
    expect(tracker.weight('a')).toBe(1);
    now = 1; // 1ms later — still effectively 1
    expect(tracker.weight('a')).toBeGreaterThan(0.99);
  });

  it('decays exponentially with the configured half-life', () => {
    let now = 0;
    const tracker = new InMemoryRecencyTracker({ now: () => now, halfLifeMs: 1000 });
    tracker.bump('a');
    now = 1000; // one half-life
    expect(tracker.weight('a')).toBeCloseTo(0.5, 5);
    now = 2000; // two half-lives
    expect(tracker.weight('a')).toBeCloseTo(0.25, 5);
    now = 10000; // 10 half-lives
    expect(tracker.weight('a')).toBeLessThan(0.001);
  });

  it('the most recent bump wins', () => {
    let now = 0;
    const tracker = new InMemoryRecencyTracker({ now: () => now, halfLifeMs: 1000 });
    tracker.bump('a');
    now = 5000; // five half-lives — weight ≈ 0.03
    expect(tracker.weight('a')).toBeLessThan(0.05);
    tracker.bump('a');
    expect(tracker.weight('a')).toBe(1);
  });

  it('different ids decay independently', () => {
    let now = 0;
    const tracker = new InMemoryRecencyTracker({ now: () => now, halfLifeMs: 1000 });
    tracker.bump('a');
    now = 500;
    tracker.bump('b');
    now = 1000;
    expect(tracker.weight('a')).toBeCloseTo(0.5, 5);
    expect(tracker.weight('b')).toBeCloseTo(Math.pow(0.5, 0.5), 5);
  });

  it('NoopRecencyTracker always returns 0 and bump() is a safe no-op', () => {
    NoopRecencyTracker.bump('anything');
    expect(NoopRecencyTracker.weight('a')).toBe(0);
    expect(NoopRecencyTracker.weight('anything')).toBe(0);
  });
});
