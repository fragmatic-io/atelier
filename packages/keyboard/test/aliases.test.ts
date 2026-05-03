// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it, vi } from 'vitest';
import { effectiveHotkey, InMemoryAliasOverlay } from '../src/aliases.js';
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

describe('InMemoryAliasOverlay', () => {
  it('stores and retrieves an alias', () => {
    const aliases = new InMemoryAliasOverlay();
    aliases.set('palette.open', 'cmd+j');
    expect(aliases.get('palette.open')).toBe('cmd+j');
  });

  it('returns undefined for unknown action ids', () => {
    const aliases = new InMemoryAliasOverlay();
    expect(aliases.get('nope')).toBeUndefined();
  });

  it('clear() removes an alias', () => {
    const aliases = new InMemoryAliasOverlay();
    aliases.set('palette.open', 'cmd+j');
    aliases.clear('palette.open');
    expect(aliases.get('palette.open')).toBeUndefined();
  });

  it('clear() is a no-op for unknown ids', () => {
    const aliases = new InMemoryAliasOverlay();
    expect(() => aliases.clear('nope')).not.toThrow();
  });

  it('throws on a malformed hotkey at set time (fail loudly)', () => {
    const aliases = new InMemoryAliasOverlay();
    expect(() => aliases.set('palette.open', 'cmd+')).toThrow();
  });

  it('list() returns a frozen snapshot', () => {
    const aliases = new InMemoryAliasOverlay();
    aliases.set('a', 'cmd+a');
    aliases.set('b', 'cmd+b');
    const snap = aliases.list();
    expect(snap).toEqual({ a: 'cmd+a', b: 'cmd+b' });
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it('list() returns the same reference until a mutation happens', () => {
    const aliases = new InMemoryAliasOverlay();
    aliases.set('a', 'cmd+a');
    const first = aliases.list();
    const second = aliases.list();
    expect(second).toBe(first);
    aliases.set('b', 'cmd+b');
    expect(aliases.list()).not.toBe(first);
  });

  it('subscribe fires on set and clear', () => {
    const aliases = new InMemoryAliasOverlay();
    const listener = vi.fn();
    const off = aliases.subscribe(listener);
    aliases.set('a', 'cmd+a');
    aliases.set('b', 'cmd+b');
    aliases.clear('a');
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    aliases.set('c', 'cmd+c');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('setting the same alias twice does not re-notify', () => {
    const aliases = new InMemoryAliasOverlay();
    const listener = vi.fn();
    aliases.subscribe(listener);
    aliases.set('a', 'cmd+a');
    aliases.set('a', 'cmd+a');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('seeds initial entries through the constructor', () => {
    const aliases = new InMemoryAliasOverlay({ a: 'cmd+a', b: 'cmd+b' });
    expect(aliases.get('a')).toBe('cmd+a');
    expect(aliases.get('b')).toBe('cmd+b');
  });

  it('drops corrupt seed entries silently', () => {
    const aliases = new InMemoryAliasOverlay({ a: 'cmd+a', bad: 'cmd+' });
    expect(aliases.get('a')).toBe('cmd+a');
    expect(aliases.get('bad')).toBeUndefined();
  });
});

describe('effectiveHotkey', () => {
  it('returns the alias when present', () => {
    const aliases = new InMemoryAliasOverlay();
    aliases.set('palette.open', 'cmd+j');
    expect(effectiveHotkey('palette.open', 'cmd+k', aliases)).toBe('cmd+j');
  });

  it('falls back to the declared hotkey when no alias is set', () => {
    const aliases = new InMemoryAliasOverlay();
    expect(effectiveHotkey('palette.open', 'cmd+k', aliases)).toBe('cmd+k');
  });

  it('returns undefined when neither alias nor declared exists', () => {
    const aliases = new InMemoryAliasOverlay();
    expect(effectiveHotkey('unbound', undefined, aliases)).toBeUndefined();
  });

  it('handles a missing overlay (returns declared)', () => {
    expect(effectiveHotkey('palette.open', 'cmd+k', undefined)).toBe('cmd+k');
  });
});

describe('registry resolve with alias overlay', () => {
  it('alias wins over declared hotkey', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'palette', label: 'palette', hotkey: 'cmd+k', invoke: () => undefined });
    const aliases = new InMemoryAliasOverlay();
    aliases.set('palette', 'cmd+j');
    // Cmd+J fires (alias)
    expect(reg.resolve(ev('j', { metaKey: true }), 'mac', aliases)?.id).toBe('palette');
    // Cmd+K does NOT fire (the alias replaces the declared binding)
    expect(reg.resolve(ev('k', { metaKey: true }), 'mac', aliases)).toBeNull();
  });

  it('actions without aliases use the declared hotkey', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'palette', label: 'palette', hotkey: 'cmd+k', invoke: () => undefined });
    const aliases = new InMemoryAliasOverlay();
    expect(reg.resolve(ev('k', { metaKey: true }), 'mac', aliases)?.id).toBe('palette');
  });

  it('aliasing an action with no declared hotkey adds a binding', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'noop', label: 'noop', invoke: () => undefined });
    const aliases = new InMemoryAliasOverlay();
    aliases.set('noop', 'cmd+n');
    expect(reg.resolve(ev('n', { metaKey: true }), 'mac', aliases)?.id).toBe('noop');
  });

  it('clearing an alias restores the declared hotkey behaviour', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'palette', label: 'palette', hotkey: 'cmd+k', invoke: () => undefined });
    const aliases = new InMemoryAliasOverlay();
    aliases.set('palette', 'cmd+j');
    aliases.clear('palette');
    expect(reg.resolve(ev('k', { metaKey: true }), 'mac', aliases)?.id).toBe('palette');
  });

  it('resolve still works when no overlay is passed (backwards compat)', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'palette', label: 'palette', hotkey: 'cmd+k', invoke: () => undefined });
    expect(reg.resolve(ev('k', { metaKey: true }), 'mac')?.id).toBe('palette');
  });
});
