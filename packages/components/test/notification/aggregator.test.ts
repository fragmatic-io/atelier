// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it, vi } from 'vitest';
import { NotificationAggregator } from '../../src/notification/aggregator.js';

describe('NotificationAggregator — set / get', () => {
  it('stores a freshly set entry', () => {
    const agg = new NotificationAggregator();
    agg.set('workspace-acme', { scope: 'workspace-acme', total: 5 });
    expect(agg.get('workspace-acme')).toEqual({ scope: 'workspace-acme', total: 5 });
  });

  it('preserves the mentions subset when supplied', () => {
    const agg = new NotificationAggregator();
    agg.set('channel-eng', { scope: 'channel-eng', total: 8, mentions: 2 });
    expect(agg.get('channel-eng')).toEqual({ scope: 'channel-eng', total: 8, mentions: 2 });
  });

  it('omits a zero `mentions` value from the stored shape', () => {
    const agg = new NotificationAggregator();
    agg.set('channel-eng', { scope: 'channel-eng', total: 3, mentions: 0 });
    expect(agg.get('channel-eng')).toEqual({ scope: 'channel-eng', total: 3 });
  });

  it('clamps negative / non-finite values to zero', () => {
    const agg = new NotificationAggregator();
    agg.set('weird', { scope: 'weird', total: -4, mentions: Number.NaN });
    expect(agg.get('weird')).toEqual({ scope: 'weird', total: 0 });
  });

  it('floors fractional values', () => {
    const agg = new NotificationAggregator();
    agg.set('s', { scope: 's', total: 4.7, mentions: 1.9 });
    expect(agg.get('s')).toEqual({ scope: 's', total: 4, mentions: 1 });
  });

  it('replaces an earlier value when set is called twice', () => {
    const agg = new NotificationAggregator();
    agg.set('s', { scope: 's', total: 1 });
    agg.set('s', { scope: 's', total: 9, mentions: 2 });
    expect(agg.get('s')).toEqual({ scope: 's', total: 9, mentions: 2 });
  });

  it('returns undefined for unknown scopes', () => {
    const agg = new NotificationAggregator();
    expect(agg.get('missing')).toBeUndefined();
  });
});

describe('NotificationAggregator — rollup', () => {
  it('sums entries whose scope starts with the prefix', () => {
    const agg = new NotificationAggregator();
    agg.set('workspace-acme.channel-eng', {
      scope: 'workspace-acme.channel-eng',
      total: 5,
      mentions: 1,
    });
    agg.set('workspace-acme.channel-design', {
      scope: 'workspace-acme.channel-design',
      total: 3,
    });
    agg.set('workspace-other.channel-x', { scope: 'workspace-other.channel-x', total: 10 });
    const out = agg.rollup('workspace-acme');
    expect(out.total).toBe(8);
    expect(out.mentions).toBe(1);
    expect(out.scope).toBe('workspace-acme');
  });

  it('omits mentions when no rolled-up entry has any', () => {
    const agg = new NotificationAggregator();
    agg.set('a.b', { scope: 'a.b', total: 2 });
    agg.set('a.c', { scope: 'a.c', total: 3 });
    expect(agg.rollup('a')).toEqual({ scope: 'a', total: 5 });
  });

  it('includes the exact-match entry when scope === prefix', () => {
    const agg = new NotificationAggregator();
    agg.set('a', { scope: 'a', total: 4, mentions: 1 });
    agg.set('a.child', { scope: 'a.child', total: 1 });
    expect(agg.rollup('a')).toEqual({ scope: 'a', total: 5, mentions: 1 });
  });

  it('returns total=0 with no entries matching', () => {
    const agg = new NotificationAggregator();
    agg.set('a', { scope: 'a', total: 5 });
    expect(agg.rollup('z')).toEqual({ scope: 'z', total: 0 });
  });

  it('rollup("") sums every entry (global total)', () => {
    const agg = new NotificationAggregator();
    agg.set('a', { scope: 'a', total: 5 });
    agg.set('b', { scope: 'b', total: 7, mentions: 2 });
    expect(agg.rollup('')).toEqual({ scope: '', total: 12, mentions: 2 });
  });
});

describe('NotificationAggregator — list', () => {
  it('returns each entry once in insertion order', () => {
    const agg = new NotificationAggregator();
    agg.set('alpha', { scope: 'alpha', total: 1 });
    agg.set('beta', { scope: 'beta', total: 2 });
    agg.set('gamma', { scope: 'gamma', total: 3 });
    expect(agg.list().map((e) => e.scope)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('returns a frozen snapshot', () => {
    const agg = new NotificationAggregator();
    agg.set('a', { scope: 'a', total: 1 });
    const out = agg.list();
    expect(Object.isFrozen(out)).toBe(true);
  });

  it('returns the empty array on a fresh aggregator', () => {
    expect(new NotificationAggregator().list()).toEqual([]);
  });
});

describe('NotificationAggregator — subscribe', () => {
  it('fires a listener after a set call', () => {
    const agg = new NotificationAggregator();
    const listener = vi.fn();
    agg.subscribe(listener);
    agg.set('a', { scope: 'a', total: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('fires every listener after each mutation', () => {
    const agg = new NotificationAggregator();
    const a = vi.fn();
    const b = vi.fn();
    agg.subscribe(a);
    agg.subscribe(b);
    agg.set('s', { scope: 's', total: 2 });
    agg.set('s', { scope: 's', total: 3 });
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('returns an unsubscribe handle that removes the listener', () => {
    const agg = new NotificationAggregator();
    const listener = vi.fn();
    const unsub = agg.subscribe(listener);
    unsub();
    agg.set('a', { scope: 'a', total: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps emitting to OTHER listeners when one throws', () => {
    const agg = new NotificationAggregator();
    const ok = vi.fn();
    agg.subscribe(() => {
      throw new Error('boom');
    });
    agg.subscribe(ok);
    agg.set('a', { scope: 'a', total: 1 });
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('clear() emits when entries existed', () => {
    const agg = new NotificationAggregator();
    const listener = vi.fn();
    agg.set('a', { scope: 'a', total: 1 });
    agg.subscribe(listener);
    agg.clear();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(agg.list()).toEqual([]);
  });

  it('clear() on an empty aggregator does NOT emit', () => {
    const agg = new NotificationAggregator();
    const listener = vi.fn();
    agg.subscribe(listener);
    agg.clear();
    expect(listener).not.toHaveBeenCalled();
  });
});
