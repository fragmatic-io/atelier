// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it, vi } from 'vitest';
import { InMemoryQuickSwitchIndex } from '../src/quickswitch.js';

describe('InMemoryQuickSwitchIndex', () => {
  it('add() inserts items in order; list() returns them', () => {
    const ix = new InMemoryQuickSwitchIndex();
    ix.add([
      { id: 'route:/today', label: 'Today', kind: 'route' },
      { id: 'route:/inbox', label: 'Inbox', kind: 'route' },
    ]);
    expect(ix.list().map((i) => i.id)).toEqual(['route:/today', 'route:/inbox']);
  });

  it('add() with the same id replaces in place', () => {
    const ix = new InMemoryQuickSwitchIndex();
    ix.add([{ id: 'a', label: 'first' }]);
    ix.add([{ id: 'a', label: 'second' }]);
    expect(ix.list().length).toBe(1);
    expect(ix.list()[0]?.label).toBe('second');
  });

  it('add() bulk preserves insertion order across calls', () => {
    const ix = new InMemoryQuickSwitchIndex();
    ix.add([{ id: 'a', label: 'A' }]);
    ix.add([
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ]);
    expect(ix.list().map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('add([]) is a no-op (no notify)', () => {
    const ix = new InMemoryQuickSwitchIndex();
    const listener = vi.fn();
    ix.subscribe(listener);
    ix.add([]);
    expect(listener).not.toHaveBeenCalled();
    expect(ix.list().length).toBe(0);
  });

  it('remove() drops by id', () => {
    const ix = new InMemoryQuickSwitchIndex();
    ix.add([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    ix.remove(['a']);
    expect(ix.list().map((i) => i.id)).toEqual(['b']);
  });

  it('remove() ignores unknown ids without notifying', () => {
    const ix = new InMemoryQuickSwitchIndex();
    const listener = vi.fn();
    ix.add([{ id: 'a', label: 'A' }]);
    ix.subscribe(listener);
    listener.mockClear();
    ix.remove(['does-not-exist']);
    expect(listener).not.toHaveBeenCalled();
    expect(ix.list().length).toBe(1);
  });

  it('remove([]) is a no-op', () => {
    const ix = new InMemoryQuickSwitchIndex();
    const listener = vi.fn();
    ix.add([{ id: 'a', label: 'A' }]);
    ix.subscribe(listener);
    listener.mockClear();
    ix.remove([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('list() returns a stable reference across reads (no mutation in between)', () => {
    const ix = new InMemoryQuickSwitchIndex();
    ix.add([{ id: 'a', label: 'A' }]);
    const a = ix.list();
    const b = ix.list();
    expect(a).toBe(b);
  });

  it('list() reference changes after a mutation', () => {
    const ix = new InMemoryQuickSwitchIndex();
    ix.add([{ id: 'a', label: 'A' }]);
    const a = ix.list();
    ix.add([{ id: 'b', label: 'B' }]);
    const b = ix.list();
    expect(a).not.toBe(b);
  });

  it('subscribe fires once per add() call (bulk = single notify)', () => {
    const ix = new InMemoryQuickSwitchIndex();
    const listener = vi.fn();
    ix.subscribe(listener);
    ix.add([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribe returns an unsubscribe thunk', () => {
    const ix = new InMemoryQuickSwitchIndex();
    const listener = vi.fn();
    const off = ix.subscribe(listener);
    ix.add([{ id: 'a', label: 'A' }]);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    ix.add([{ id: 'b', label: 'B' }]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a listener that unsubscribes during notification does not perturb others', () => {
    const ix = new InMemoryQuickSwitchIndex();
    const listenerB = vi.fn();
    const listenerA = vi.fn(() => {
      offA();
    });
    const offA = ix.subscribe(listenerA);
    ix.subscribe(listenerB);
    ix.add([{ id: 'a', label: 'A' }]);
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
  });

  it('preserves rich item shape (kind / href / description / icon / keywords)', () => {
    const ix = new InMemoryQuickSwitchIndex();
    ix.add([
      {
        id: 'route:/today',
        label: 'Today',
        kind: 'route',
        href: '/today',
        description: 'Daily review',
        icon: 'calendar',
        keywords: ['inbox', 'now'],
      },
    ]);
    const item = ix.list()[0]!;
    expect(item.kind).toBe('route');
    expect(item.href).toBe('/today');
    expect(item.description).toBe('Daily review');
    expect(item.icon).toBe('calendar');
    expect(item.keywords).toEqual(['inbox', 'now']);
  });
});
