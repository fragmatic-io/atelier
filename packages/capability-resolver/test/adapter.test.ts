// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for the adapter that bridges `CapabilityResolver` to
 * `@cir/compiler`'s `SemanticSearch` seam. Coverage:
 *
 *   - `semanticSearchFromResolver` returns an object with a sync `search`
 *     and an async `prime` — calling `prime` then `search.capabilities`
 *     returns the resolver's refs
 *   - cold cache (no prime call) returns []
 *   - mismatched query (different from the last primed) returns []
 *   - resolver throw is swallowed; `onError` fires; `lastRefs` is reset
 *   - returned `SemanticSearch` matches the type from `@cir/compiler`
 *   - `semanticSearchFromLookup` adapts a sync function correctly
 */

import type { Capability } from '@cir/schemas';
import type { SemanticSearch } from '@cir/compiler';
import { describe, expect, it, vi } from 'vitest';
import {
  SubstringCapabilityResolver,
  semanticSearchFromLookup,
  semanticSearchFromResolver,
} from '../src/index.js';
import type { CapabilityResolver, ScopeRequest } from '../src/types.js';

function caps(): Record<string, Capability> {
  return {
    'thread.archive': {
      id: 'thread.archive',
      kind: 'action',
      version: '1.0.0',
      description: 'Archive a thread (reversible).',
    } as unknown as Capability,
    'thread.list': {
      id: 'thread.list',
      kind: 'data',
      version: '1.0.0',
      description: 'List threads in the inbox.',
    } as unknown as Capability,
  };
}

const REQUEST: ScopeRequest = {
  intent: 'placeholder', // overridden by `prime(query)`
  route: '/today',
  userId: 'u1',
  appId: 'a1',
};

describe('semanticSearchFromResolver', () => {
  it('after prime(), search.capabilities returns the resolver refs', async () => {
    const resolver = new SubstringCapabilityResolver();
    const primed = semanticSearchFromResolver(resolver, {
      registry: caps(),
      request: REQUEST,
    });
    await primed.prime('archive thread', 5);
    const refs = primed.search.capabilities!('archive thread', 5);
    expect(refs.map((c) => c.id)).toContain('thread.archive');
  });

  it('cold cache (no prime) returns []', () => {
    const resolver = new SubstringCapabilityResolver();
    const primed = semanticSearchFromResolver(resolver, {
      registry: caps(),
      request: REQUEST,
    });
    expect(primed.search.capabilities!('anything', 5)).toEqual([]);
  });

  it('search() with mismatched query filters the pre-scoped set', async () => {
    const resolver = new SubstringCapabilityResolver();
    const primed = semanticSearchFromResolver(resolver, {
      registry: caps(),
      request: REQUEST,
    });
    // Prime with a broad intent that picks both capabilities.
    await primed.prime('thread archive list', 5);
    expect(primed.lastRefs.length).toBeGreaterThan(1);
    // Sub-query "list" filters within the pre-scoped set.
    const refs = primed.search.capabilities!('list', 5);
    expect(refs.map((c) => c.id)).toEqual(['thread.list']);
  });

  it('search() with no-match sub-query returns the full pre-scoped set (defensive)', async () => {
    const resolver = new SubstringCapabilityResolver();
    const primed = semanticSearchFromResolver(resolver, {
      registry: caps(),
      request: REQUEST,
    });
    await primed.prime('archive', 5);
    // "completely unrelated" doesn't match anything in the pre-scoped
    // set; we return the pre-scoped set rather than [] so the agent
    // doesn't fall back to the FULL registry (which would defeat
    // scoping).
    const refs = primed.search.capabilities!('completely unrelated', 5);
    expect(refs.length).toBe(primed.lastRefs.length);
  });

  it('search() returns [] when nothing has been primed yet', () => {
    const resolver = new SubstringCapabilityResolver();
    const primed = semanticSearchFromResolver(resolver, {
      registry: caps(),
      request: REQUEST,
    });
    expect(primed.search.capabilities!('anything', 5)).toEqual([]);
  });

  it('search() respects k clamp', async () => {
    const resolver = new SubstringCapabilityResolver();
    const primed = semanticSearchFromResolver(resolver, {
      registry: caps(),
      request: REQUEST,
    });
    await primed.prime('list', 5);
    expect(primed.search.capabilities!('list', 1)).toHaveLength(1);
  });

  it('exposes lastQuery and lastRefs for diagnostics', async () => {
    const resolver = new SubstringCapabilityResolver();
    const primed = semanticSearchFromResolver(resolver, {
      registry: caps(),
      request: REQUEST,
    });
    await primed.prime('archive', 5);
    expect(primed.lastQuery).toBe('archive');
    expect(primed.lastRefs.length).toBeGreaterThan(0);
  });

  it('swallows resolver throws; onError fires; lastRefs is reset', async () => {
    const throwing: CapabilityResolver = {
      id: 'throwing',
      scope: () => {
        throw new Error('resolver boom');
      },
    };
    const onError = vi.fn();
    const primed = semanticSearchFromResolver(throwing, {
      registry: caps(),
      request: REQUEST,
      onError,
    });
    const refs = await primed.prime('anything');
    expect(refs).toEqual([]);
    expect(onError).toHaveBeenCalledOnce();
    expect(primed.lastRefs).toEqual([]);
  });

  it('uses defaultK when prime called without k', async () => {
    const recorded: Array<{ k: number }> = [];
    const recording: CapabilityResolver = {
      id: 'recording',
      scope: (_req, k, _registry) => {
        recorded.push({ k });
        return Promise.resolve([]);
      },
    };
    const primed = semanticSearchFromResolver(recording, {
      registry: caps(),
      request: REQUEST,
      defaultK: 7,
    });
    await primed.prime('any');
    expect(recorded[0]?.k).toBe(7);
  });

  it('produces a SemanticSearch shape that satisfies @cir/compiler', () => {
    const resolver = new SubstringCapabilityResolver();
    const primed = semanticSearchFromResolver(resolver, {
      registry: caps(),
      request: REQUEST,
    });
    // Type-only assertion — if `primed.search` doesn't satisfy the
    // imported type, this assignment fails to compile.
    const ss: SemanticSearch = primed.search;
    expect(typeof ss.capabilities).toBe('function');
    // No `components` field — the resolver only scopes capabilities.
    expect(ss.components).toBeUndefined();
  });
});

describe('semanticSearchFromLookup', () => {
  it('forwards (query, k) to the lookup function', () => {
    const lookup = vi.fn().mockReturnValue([{ id: 'thread.archive' }]);
    const ss = semanticSearchFromLookup(lookup);
    const refs = ss.capabilities!('archive', 5);
    expect(refs).toEqual([{ id: 'thread.archive' }]);
    expect(lookup).toHaveBeenCalledWith('archive', 5);
  });

  it('returns [] when the lookup returns null', () => {
    const ss = semanticSearchFromLookup(() => null);
    expect(ss.capabilities!('anything', 5)).toEqual([]);
  });

  it('produces a SemanticSearch shape', () => {
    const ss: SemanticSearch = semanticSearchFromLookup(() => []);
    expect(typeof ss.capabilities).toBe('function');
  });
});
