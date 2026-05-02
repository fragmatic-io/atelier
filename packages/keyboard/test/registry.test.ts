// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it, vi } from 'vitest';
import { InMemoryKeyboardRegistry } from '../src/registry.js';
import type { HotkeyEventLike } from '../src/hotkey.js';

function ev(
  key: string,
  mods: Partial<Pick<HotkeyEventLike, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>> = {},
): HotkeyEventLike {
  return {
    key,
    ctrlKey: mods.ctrlKey ?? false,
    shiftKey: mods.shiftKey ?? false,
    altKey: mods.altKey ?? false,
    metaKey: mods.metaKey ?? false,
  };
}

describe('InMemoryKeyboardRegistry', () => {
  it('registers and lists actions in insertion order', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'a', label: 'A', invoke: () => undefined });
    reg.register({ id: 'b', label: 'B', invoke: () => undefined });
    reg.register({ id: 'c', label: 'C', invoke: () => undefined });
    expect(reg.list().map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('register returns an unregister thunk', () => {
    const reg = new InMemoryKeyboardRegistry();
    const off = reg.register({ id: 'a', label: 'A', invoke: () => undefined });
    expect(reg.list().length).toBe(1);
    off();
    expect(reg.list().length).toBe(0);
  });

  it('re-registering the same id replaces in place', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'a', label: 'first', invoke: () => undefined });
    reg.register({ id: 'a', label: 'second', invoke: () => undefined });
    expect(reg.list().length).toBe(1);
    expect(reg.list()[0]?.label).toBe('second');
  });

  it('a stale unregister thunk does NOT remove a re-registered entry', () => {
    const reg = new InMemoryKeyboardRegistry();
    const off = reg.register({ id: 'a', label: 'first', invoke: () => undefined });
    reg.register({ id: 'a', label: 'second', invoke: () => undefined });
    off();
    expect(reg.list().length).toBe(1);
    expect(reg.list()[0]?.label).toBe('second');
  });

  it('unregister(id) removes by id', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'a', label: 'A', invoke: () => undefined });
    reg.unregister('a');
    expect(reg.list().length).toBe(0);
  });

  it('unregister(id) is a no-op for unknown ids', () => {
    const reg = new InMemoryKeyboardRegistry();
    expect(() => {
      reg.unregister('does-not-exist');
    }).not.toThrow();
  });

  it('list(scope) filters by scope; default scope is global', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'g1', label: 'G1', invoke: () => undefined });
    reg.register({ id: 'g2', label: 'G2', scope: 'global', invoke: () => undefined });
    reg.register({ id: 'r1', label: 'R1', scope: 'route', invoke: () => undefined });
    expect(reg.list('global').map((a) => a.id)).toEqual(['g1', 'g2']);
    expect(reg.list('route').map((a) => a.id)).toEqual(['r1']);
    expect(reg.list().length).toBe(3);
  });

  it('resolve matches the registered hotkey on mac', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({
      id: 'palette',
      label: 'Open palette',
      hotkey: 'cmd+k',
      invoke: () => undefined,
    });
    const match = reg.resolve(ev('k', { metaKey: true }), 'mac');
    expect(match?.id).toBe('palette');
  });

  it('resolve returns null when no hotkey matches', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({
      id: 'palette',
      label: 'Open palette',
      hotkey: 'cmd+k',
      invoke: () => undefined,
    });
    expect(reg.resolve(ev('k'), 'mac')).toBeNull();
  });

  it('resolve prefers the most-recently-registered action on collision', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'first', label: 'first', hotkey: 'cmd+k', invoke: () => undefined });
    reg.register({ id: 'second', label: 'second', hotkey: 'cmd+k', invoke: () => undefined });
    expect(reg.resolve(ev('k', { metaKey: true }), 'mac')?.id).toBe('second');
  });

  it('actions without hotkeys never match', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'noop', label: 'noop', invoke: () => undefined });
    expect(reg.resolve(ev('k', { metaKey: true }), 'mac')).toBeNull();
  });

  it('subscribe is called on register and unregister', () => {
    const reg = new InMemoryKeyboardRegistry();
    const listener = vi.fn();
    const off = reg.subscribe(listener);
    reg.register({ id: 'a', label: 'A', invoke: () => undefined });
    reg.register({ id: 'b', label: 'B', invoke: () => undefined });
    reg.unregister('a');
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    reg.register({ id: 'c', label: 'C', invoke: () => undefined });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('a listener that unsubscribes during notification does not perturb others', () => {
    const reg = new InMemoryKeyboardRegistry();
    const listenerB = vi.fn();
    const listenerA = vi.fn(() => {
      // Self-unsubscribe — must not throw or skip listenerB.
      offA();
    });
    const offA = reg.subscribe(listenerA);
    reg.subscribe(listenerB);
    reg.register({ id: 'a', label: 'A', invoke: () => undefined });
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
  });

  it('resolve respects the platform argument', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'p', label: 'p', hotkey: 'cmd+p', invoke: () => undefined });
    expect(reg.resolve(ev('p', { ctrlKey: true }), 'other')?.id).toBe('p');
    expect(reg.resolve(ev('p', { metaKey: true }), 'other')).toBeNull();
  });

  it('throws on a malformed hotkey at register time (fail loudly)', () => {
    const reg = new InMemoryKeyboardRegistry();
    expect(() =>
      reg.register({ id: 'bad', label: 'bad', hotkey: 'cmd+', invoke: () => undefined }),
    ).toThrow();
  });
});
