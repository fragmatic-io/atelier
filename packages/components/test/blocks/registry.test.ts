// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it, vi } from 'vitest';
import {
  ALL_SURFACES,
  InMemoryBlockKindRegistry,
  type BlockKind,
} from '../../src/blocks/registry.js';

function makeKind(id: string, overrides: Partial<BlockKind> = {}): BlockKind {
  return {
    id,
    label: overrides.label ?? id,
    insert: overrides.insert ?? ((): void => undefined),
    ...overrides,
  };
}

describe('InMemoryBlockKindRegistry', () => {
  it('add() then list() returns the kind for the same surface', () => {
    const reg = new InMemoryBlockKindRegistry();
    const kind = makeKind('text.paragraph');
    reg.add(kind, 'doc');
    expect(reg.list('doc')).toEqual([kind]);
  });

  it('list() preserves registration order', () => {
    const reg = new InMemoryBlockKindRegistry();
    const a = makeKind('a');
    const b = makeKind('b');
    const c = makeKind('c');
    reg.add(a, 'doc');
    reg.add(b, 'doc');
    reg.add(c, 'doc');
    expect(reg.list('doc').map((k) => k.id)).toEqual(['a', 'b', 'c']);
  });

  it('add() defaults surface to ALL_SURFACES wildcard', () => {
    const reg = new InMemoryBlockKindRegistry();
    const kind = makeKind('text.paragraph');
    reg.add(kind);
    expect(reg.list('doc')).toEqual([kind]);
    expect(reg.list('chat')).toEqual([kind]);
    expect(reg.list('comment')).toEqual([kind]);
  });

  it('list() filters out kinds bound to a different surface', () => {
    const reg = new InMemoryBlockKindRegistry();
    const docOnly = makeKind('text.heading-1');
    const chatOnly = makeKind('chat.reply');
    reg.add(docOnly, 'doc');
    reg.add(chatOnly, 'chat');
    expect(reg.list('doc').map((k) => k.id)).toEqual(['text.heading-1']);
    expect(reg.list('chat').map((k) => k.id)).toEqual(['chat.reply']);
  });

  it('list() merges wildcard + surface-specific in registration order', () => {
    const reg = new InMemoryBlockKindRegistry();
    reg.add(makeKind('p'), ALL_SURFACES);
    reg.add(makeKind('chat.reply'), 'chat');
    reg.add(makeKind('img'), ALL_SURFACES);
    expect(reg.list('chat').map((k) => k.id)).toEqual(['p', 'chat.reply', 'img']);
    // The doc surface only sees the two wildcards.
    expect(reg.list('doc').map((k) => k.id)).toEqual(['p', 'img']);
  });

  it('add() with the same id and surface overwrites the previous entry', () => {
    const reg = new InMemoryBlockKindRegistry();
    const v1 = makeKind('p', { label: 'Paragraph v1' });
    const v2 = makeKind('p', { label: 'Paragraph v2' });
    reg.add(v1, 'doc');
    reg.add(v2, 'doc');
    expect(reg.list('doc')).toEqual([v2]);
  });

  it('surface-specific entry overrides a wildcard entry for the same id', () => {
    const reg = new InMemoryBlockKindRegistry();
    const wildcard = makeKind('img', { label: 'Image (any)' });
    const docOverride = makeKind('img', { label: 'Image (doc-specific)' });
    reg.add(wildcard, ALL_SURFACES);
    reg.add(docOverride, 'doc');
    expect(reg.list('doc')).toEqual([docOverride]);
    // Other surfaces still see the wildcard.
    expect(reg.list('chat')).toEqual([wildcard]);
  });

  it('remove() drops every registration of an id', () => {
    const reg = new InMemoryBlockKindRegistry();
    const kind = makeKind('p');
    reg.add(kind, 'doc');
    reg.add(kind, 'chat');
    reg.remove('p');
    expect(reg.list('doc')).toEqual([]);
    expect(reg.list('chat')).toEqual([]);
  });

  it('remove() is silent on unknown ids', () => {
    const reg = new InMemoryBlockKindRegistry();
    expect(() => {
      reg.remove('nope');
    }).not.toThrow();
  });

  it('subscribe() fires after add', () => {
    const reg = new InMemoryBlockKindRegistry();
    const listener = vi.fn();
    reg.subscribe(listener);
    reg.add(makeKind('p'), 'doc');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribe() fires after remove that mutated', () => {
    const reg = new InMemoryBlockKindRegistry();
    reg.add(makeKind('p'), 'doc');
    const listener = vi.fn();
    reg.subscribe(listener);
    reg.remove('p');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribe() does NOT fire on a remove that was a no-op', () => {
    const reg = new InMemoryBlockKindRegistry();
    const listener = vi.fn();
    reg.subscribe(listener);
    reg.remove('does-not-exist');
    expect(listener).toHaveBeenCalledTimes(0);
  });

  it('subscribe() returns an unsubscribe function', () => {
    const reg = new InMemoryBlockKindRegistry();
    const listener = vi.fn();
    const unsub = reg.subscribe(listener);
    reg.add(makeKind('a'), 'doc');
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    reg.add(makeKind('b'), 'doc');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('list() returns a frozen array (no in-place mutation by callers)', () => {
    const reg = new InMemoryBlockKindRegistry();
    reg.add(makeKind('p'), 'doc');
    const list = reg.list('doc');
    expect(Object.isFrozen(list)).toBe(true);
  });

  it('a misbehaving listener does not break the rest of the subscriber set', () => {
    const reg = new InMemoryBlockKindRegistry();
    const broken = vi.fn(() => {
      throw new Error('boom');
    });
    const ok = vi.fn();
    // Suppress the console.warn the registry emits to keep test output clean.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    reg.subscribe(broken);
    reg.subscribe(ok);
    reg.add(makeKind('p'), 'doc');
    expect(broken).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('ALL_SURFACES export equals the wildcard sentinel', () => {
    expect(ALL_SURFACES).toBe('*');
  });
});
