// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `EmbeddingCapabilityResolver`. The resolver wraps an
 * `EmbeddingClient` + a pre-built `EmbeddingIndex`. We drive both with
 * hand-rolled stubs so behaviour is fully deterministic. Coverage:
 *
 *   - happy path: query embedded → topK → registry-validated refs
 *   - cosine ranking flows through to the returned ref order
 *   - hits referencing ids no longer in the live registry are dropped
 *   - all-stale hits cascade to fallback (don't starve the agent)
 *   - empty index cascades to fallback (cold-start)
 *   - client throw cascades to fallback + fires onError
 *   - empty intent / k<=0 short-circuits without calling the client
 *   - id default + override
 *   - observers that throw don't poison the resolver
 *   - clamps to k
 */

import type { Capability } from '@atelier/schemas';
import { describe, expect, it } from 'vitest';
import { InMemoryEmbeddingIndex, type EmbeddingClient } from '../src/embedding-index.js';
import { EmbeddingCapabilityResolver } from '../src/embedding-resolver.js';
import { SubstringCapabilityResolver } from '../src/substring-resolver.js';

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
    'github.issue.list': {
      id: 'github.issue.list',
      kind: 'data',
      version: '1.0.0',
      description: 'List GitHub issues.',
    } as unknown as Capability,
  };
}

const REQ = { intent: 'archive a thread', route: '/today', userId: 'u1', appId: 'a1' };

/**
 * Deterministic embedding stub. Each known string maps to a fixed
 * vector; unknown strings throw. Tests build the index AND the query
 * embedding from the same `table` so similarity orderings are exact.
 */
function fakeClient(table: Record<string, readonly number[]>): EmbeddingClient {
  return {
    id: 'mock-embed',
    embed: async (text) => {
      const v = table[text];
      if (!v) throw new Error(`fakeClient: no vector for "${text}"`);
      return Promise.resolve(v);
    },
  };
}

const VECTORS: Record<string, readonly number[]> = {
  // Capability-side strings (id + ': ' + description).
  'thread.archive: Archive a thread (reversible).': [1, 0, 0],
  'thread.list: List threads in the inbox.': [0.7, 0.7, 0],
  'github.issue.list: List GitHub issues.': [0, 0, 1],
  // Query-side strings.
  'archive a thread': [1, 0, 0], // best-matches thread.archive
  'list issues on github': [0, 0, 1], // best-matches github.issue.list
  'something completely unrelated': [0.1, 0.1, 0.1],
};

async function buildIndex(): Promise<InMemoryEmbeddingIndex> {
  const idx = new InMemoryEmbeddingIndex();
  const reg = caps();
  await idx.build(Object.values(reg), fakeClient(VECTORS));
  return idx;
}

describe('EmbeddingCapabilityResolver', () => {
  it('returns refs ranked by cosine similarity', async () => {
    const index = await buildIndex();
    const r = new EmbeddingCapabilityResolver({ index, client: fakeClient(VECTORS) });
    const refs = await r.scope(REQ, 5, caps());
    // Query "archive a thread" → (1,0,0) is closest to thread.archive
    // (cos=1), then thread.list (cos~0.707), then github.issue.list (0).
    expect(refs.map((c) => c.id)).toEqual(['thread.archive', 'thread.list', 'github.issue.list']);
    expect(refs[0]?.description).toBe('Archive a thread (reversible).');
  });

  it('different intent → different ranking', async () => {
    const index = await buildIndex();
    const r = new EmbeddingCapabilityResolver({ index, client: fakeClient(VECTORS) });
    const refs = await r.scope({ ...REQ, intent: 'list issues on github' }, 5, caps());
    expect(refs[0]?.id).toBe('github.issue.list');
  });

  it('clamps to k', async () => {
    const index = await buildIndex();
    const r = new EmbeddingCapabilityResolver({ index, client: fakeClient(VECTORS) });
    const refs = await r.scope(REQ, 1, caps());
    expect(refs).toHaveLength(1);
    expect(refs[0]?.id).toBe('thread.archive');
  });

  it('drops hits whose ids are not in the live registry', async () => {
    const index = await buildIndex();
    // Caller passes a registry that no longer contains thread.archive
    // (e.g. a hot-removed capability between build and scope).
    const reg = caps();
    delete reg['thread.archive'];
    const r = new EmbeddingCapabilityResolver({ index, client: fakeClient(VECTORS) });
    const refs = await r.scope(REQ, 5, reg);
    expect(refs.map((c) => c.id)).not.toContain('thread.archive');
    // thread.list is the next best match and survives.
    expect(refs[0]?.id).toBe('thread.list');
  });

  it('cascades to fallback when ALL hits are stale', async () => {
    const index = await buildIndex();
    // Wipe the registry so every index hit is stale. The fallback
    // (substring resolver) is given the live registry; it returns
    // nothing because the registry is empty too — but the cascade
    // happens (failure observer fires).
    const events: Array<{ emptyIndex: boolean; error: unknown }> = [];
    const r = new EmbeddingCapabilityResolver({
      index,
      client: fakeClient(VECTORS),
      onError: (e) => events.push({ emptyIndex: e.emptyIndex, error: e.error }),
    });
    const refs = await r.scope(REQ, 5, {});
    expect(refs).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]?.emptyIndex).toBe(false);
  });

  it('cold start (empty index) cascades to fallback + fires onError', async () => {
    const index = new InMemoryEmbeddingIndex(); // never built
    const events: Array<{ emptyIndex: boolean }> = [];
    // Fallback is the substring resolver; it picks `thread.archive`
    // for the intent "archive a thread".
    const r = new EmbeddingCapabilityResolver({
      index,
      client: fakeClient(VECTORS),
      onError: (e) => events.push({ emptyIndex: e.emptyIndex }),
    });
    const refs = await r.scope(REQ, 5, caps());
    expect(refs.map((c) => c.id)).toContain('thread.archive');
    expect(events).toEqual([{ emptyIndex: true }]);
  });

  it('client throw cascades to fallback + fires onError', async () => {
    const index = await buildIndex();
    const broken: EmbeddingClient = {
      id: 'broken',
      embed: async () => Promise.reject(new Error('quota')),
    };
    const events: Array<{ emptyIndex: boolean; error: unknown }> = [];
    const r = new EmbeddingCapabilityResolver({
      index,
      client: broken,
      onError: (e) => events.push({ emptyIndex: e.emptyIndex, error: e.error }),
    });
    const refs = await r.scope(REQ, 5, caps());
    // Substring fallback recovers `thread.archive` from "archive thread".
    expect(refs.map((c) => c.id)).toContain('thread.archive');
    expect(events).toHaveLength(1);
    expect(events[0]?.emptyIndex).toBe(false);
    expect(events[0]?.error).toBeInstanceOf(Error);
  });

  it('uses a custom fallback when supplied', async () => {
    const index = new InMemoryEmbeddingIndex(); // empty → cascade
    const fallback = new SubstringCapabilityResolver({ id: 'custom-substring' });
    const r = new EmbeddingCapabilityResolver({
      index,
      client: fakeClient(VECTORS),
      fallback,
    });
    const refs = await r.scope(REQ, 5, caps());
    expect(refs.map((c) => c.id)).toContain('thread.archive');
  });

  it('fires onScope on success with index size + duration', async () => {
    const index = await buildIndex();
    const events: Array<{ indexSize: number; pickedCount: number }> = [];
    const r = new EmbeddingCapabilityResolver({
      index,
      client: fakeClient(VECTORS),
      onScope: (e) => events.push({ indexSize: e.indexSize, pickedCount: e.pickedCount }),
    });
    await r.scope(REQ, 5, caps());
    expect(events).toEqual([{ indexSize: 3, pickedCount: 3 }]);
  });

  it('observers that throw do not poison the resolver', async () => {
    const index = await buildIndex();
    const r = new EmbeddingCapabilityResolver({
      index,
      client: fakeClient(VECTORS),
      onScope: () => {
        throw new Error('observer boom');
      },
      onError: () => {
        throw new Error('error observer boom');
      },
    });
    const refs = await r.scope(REQ, 5, caps());
    expect(refs[0]?.id).toBe('thread.archive');
  });

  it('returns [] for empty intent or k<=0 without calling the client', async () => {
    const index = await buildIndex();
    let calls = 0;
    const counting: EmbeddingClient = {
      id: 'counting',
      embed: async () => {
        calls += 1;
        return Promise.resolve([1, 0, 0]);
      },
    };
    const r = new EmbeddingCapabilityResolver({ index, client: counting });
    expect(await r.scope({ ...REQ, intent: '' }, 5, caps())).toEqual([]);
    expect(await r.scope(REQ, 0, caps())).toEqual([]);
    expect(await r.scope(REQ, -1, caps())).toEqual([]);
    expect(calls).toBe(0);
  });

  it('id defaults to "embedding[<client.id>]", overridable', () => {
    const index = new InMemoryEmbeddingIndex();
    const r = new EmbeddingCapabilityResolver({ index, client: fakeClient(VECTORS) });
    expect(r.id).toBe('embedding[mock-embed]');
    const r2 = new EmbeddingCapabilityResolver({
      index,
      client: fakeClient(VECTORS),
      id: 'custom-resolver',
    });
    expect(r2.id).toBe('custom-resolver');
  });

  it('surfaces description on returned refs only when the registry has one', async () => {
    const index = await buildIndex();
    const reg = caps();
    // Strip description from one capability.
    reg['thread.archive'] = {
      id: 'thread.archive',
      kind: 'action',
      version: '1.0.0',
    } as unknown as Capability;
    const r = new EmbeddingCapabilityResolver({ index, client: fakeClient(VECTORS) });
    const refs = await r.scope(REQ, 5, reg);
    const ta = refs.find((c) => c.id === 'thread.archive')!;
    expect(ta.description).toBeUndefined();
  });
});
