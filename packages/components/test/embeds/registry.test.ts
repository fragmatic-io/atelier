// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it, vi } from 'vitest';
import { InMemoryEmbedRegistry } from '../../src/embeds/registry.js';
import type { EmbedDisplay, EmbedResolver } from '../../src/embeds/resolver.js';

const stubResolver = (
  matchUrl: string,
  display: EmbedDisplay | null = { kind: 'card', title: 'stub' },
): EmbedResolver => ({
  matches: (url) => url === matchUrl,
  resolve: () => display,
});

describe('InMemoryEmbedRegistry', () => {
  it('registers a resolver under a provider key and dispatches matching URLs to it', async () => {
    const registry = new InMemoryEmbedRegistry();
    registry.add('stub', stubResolver('https://example.com/x', { kind: 'card', title: 'X' }));
    const out = await registry.resolve('https://example.com/x');
    expect(out).toEqual({ provider: 'stub', display: { kind: 'card', title: 'X' } });
  });

  it('returns null when no registered resolver matches the URL', async () => {
    const registry = new InMemoryEmbedRegistry();
    registry.add('stub', stubResolver('https://example.com/x'));
    expect(await registry.resolve('https://elsewhere.test/y')).toBeNull();
  });

  it('returns null when the matching resolver returns null', async () => {
    const registry = new InMemoryEmbedRegistry();
    registry.add('stub', stubResolver('https://example.com/x', null));
    expect(await registry.resolve('https://example.com/x')).toBeNull();
  });

  it('iterates resolvers in insertion order and stops at the first match', async () => {
    const registry = new InMemoryEmbedRegistry();
    const first: EmbedResolver = {
      matches: () => true,
      resolve: () => ({ kind: 'card', title: 'first' }),
    };
    const second = vi.fn<EmbedResolver['resolve']>(() => ({ kind: 'card', title: 'second' }));
    registry.add('first', first);
    registry.add('second', { matches: () => true, resolve: second });
    const out = await registry.resolve('https://anything.test/');
    expect(out?.provider).toBe('first');
    expect(second).not.toHaveBeenCalled();
  });

  it('replaces an existing entry when add() is called twice with the same provider key', async () => {
    const registry = new InMemoryEmbedRegistry();
    registry.add('stub', stubResolver('https://example.com/x', { kind: 'card', title: 'old' }));
    registry.add('stub', stubResolver('https://example.com/x', { kind: 'card', title: 'new' }));
    expect(registry.providers()).toEqual(['stub']);
    const out = await registry.resolve('https://example.com/x');
    expect(out?.display.title).toBe('new');
  });

  it('preserves insertion order across replacement (replacement does not move to the end)', () => {
    const registry = new InMemoryEmbedRegistry();
    registry.add('a', stubResolver('https://a/'));
    registry.add('b', stubResolver('https://b/'));
    registry.add('c', stubResolver('https://c/'));
    registry.add('a', stubResolver('https://a/', { kind: 'card', title: 'A2' }));
    expect(registry.providers()).toEqual(['a', 'b', 'c']);
  });

  it('awaits async resolvers and returns their value', async () => {
    const registry = new InMemoryEmbedRegistry();
    registry.add('async', {
      matches: () => true,
      resolve: () => Promise.resolve<EmbedDisplay>({ kind: 'card', title: 'async' }),
    });
    const out = await registry.resolve('https://x/');
    expect(out?.display.title).toBe('async');
  });

  it('treats a resolver rejection as unresolvable (no cascade to next match)', async () => {
    const registry = new InMemoryEmbedRegistry();
    const second = vi.fn<EmbedResolver['resolve']>(() => ({ kind: 'card', title: 'second' }));
    registry.add('boom', {
      matches: () => true,
      resolve: () => Promise.reject(new Error('upstream 500')),
    });
    registry.add('second', { matches: () => true, resolve: second });
    expect(await registry.resolve('https://x/')).toBeNull();
    expect(second).not.toHaveBeenCalled();
  });

  it('skips non-matching resolvers and dispatches the first matching one further down', async () => {
    const registry = new InMemoryEmbedRegistry();
    registry.add('skip', { matches: () => false, resolve: () => null });
    registry.add('hit', stubResolver('https://hit/', { kind: 'card', title: 'HIT' }));
    const out = await registry.resolve('https://hit/');
    expect(out?.provider).toBe('hit');
  });
});
