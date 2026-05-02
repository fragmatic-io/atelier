// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `TwoStageCapabilityResolver`. The resolver wraps a tiny-model
 * LLM client; we drive it with a hand-rolled stub that returns
 * pre-scripted responses (or throws on demand). Coverage:
 *
 *   - happy path: stage-1 picks ids → resolver returns matching refs
 *   - registry-validation: invented ids are dropped
 *   - cache hit: a second `scope` call with the same key skips the LLM
 *   - cache miss on different intent: hits the LLM again
 *   - stage-1 throw: falls back to substring-resolver, no cache write
 *   - stage-1 returns ONLY invented ids: treated as failure, falls back
 *   - observers fire (onScope, onStageOneFailure, recordTokens)
 *   - id default + override
 *   - empty intent / k<=0 short-circuits
 */

import type { Capability } from '@atelier/schemas';
import { describe, expect, it, vi } from 'vitest';
import { MemoryScopingCache } from '../src/cache.js';
import { SubstringCapabilityResolver } from '../src/substring-resolver.js';
import {
  TwoStageCapabilityResolver,
  type ScopingLlmClient,
  type ScopingLlmRequest,
  type ScopingLlmResponse,
} from '../src/two-stage-resolver.js';

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

/* eslint-disable @typescript-eslint/require-await -- the mock client must
   be Promise-returning to satisfy `ScopingLlmClient.pickCapabilityIds`,
   even though the body is synchronous. */
/**
 * Scripted client. Each call to `pickCapabilityIds` shifts a response
 * (or thrower) off `queue`. Captures requests for assertions.
 */
function scriptedClient(queue: Array<ScopingLlmResponse | Error>): {
  client: ScopingLlmClient;
  requests: ScopingLlmRequest[];
} {
  const requests: ScopingLlmRequest[] = [];
  return {
    requests,
    client: {
      id: 'mock-flash',
      pickCapabilityIds: async (req) => {
        requests.push(req);
        const next = queue.shift();
        if (next === undefined) throw new Error('scriptedClient: no queued response');
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

describe('TwoStageCapabilityResolver', () => {
  it('stage-1 picks ids; resolver returns matching refs in order', async () => {
    const { client } = scriptedClient([
      { ids: ['thread.archive', 'thread.list'], tokenCost: 42, model: 'gemini-2.5-flash' },
    ]);
    const r = new TwoStageCapabilityResolver({ client });
    const refs = await r.scope(REQ, 5, caps());
    expect(refs.map((c) => c.id)).toEqual(['thread.archive', 'thread.list']);
    expect(refs[0]?.description).toBe('Archive a thread (reversible).');
  });

  it('drops invented ids the model hallucinates', async () => {
    const { client } = scriptedClient([
      {
        ids: ['thread.archives', 'thread.list', 'made.up'],
        tokenCost: 12,
        model: 'gemini-2.5-flash',
      },
    ]);
    const r = new TwoStageCapabilityResolver({ client });
    const refs = await r.scope(REQ, 5, caps());
    expect(refs.map((c) => c.id)).toEqual(['thread.list']);
  });

  it('clamps to k', async () => {
    const { client } = scriptedClient([
      {
        ids: ['thread.archive', 'thread.list', 'github.issue.list'],
        tokenCost: 10,
        model: 'gemini-2.5-flash',
      },
    ]);
    const r = new TwoStageCapabilityResolver({ client });
    const refs = await r.scope(REQ, 2, caps());
    expect(refs).toHaveLength(2);
  });

  it('caches on success; second call with same intent skips the LLM', async () => {
    const { client, requests } = scriptedClient([
      { ids: ['thread.archive'], tokenCost: 10, model: 'gemini-2.5-flash' },
    ]);
    const cache = new MemoryScopingCache();
    const r = new TwoStageCapabilityResolver({ client, cache });
    await r.scope(REQ, 5, caps());
    await r.scope(REQ, 5, caps());
    expect(requests).toHaveLength(1);
  });

  it('cache-hits are reported via onScope with cacheHit=true', async () => {
    const { client } = scriptedClient([
      { ids: ['thread.archive'], tokenCost: 10, model: 'gemini-2.5-flash' },
    ]);
    const events: Array<{ cacheHit: boolean; tokenCost: number }> = [];
    const r = new TwoStageCapabilityResolver({
      client,
      onScope: (e) => events.push({ cacheHit: e.cacheHit, tokenCost: e.tokenCost }),
    });
    await r.scope(REQ, 5, caps());
    await r.scope(REQ, 5, caps());
    expect(events[0]).toEqual({ cacheHit: false, tokenCost: 10 });
    expect(events[1]).toEqual({ cacheHit: true, tokenCost: 0 });
  });

  it('different intent is a cache miss; LLM fires twice', async () => {
    const { client, requests } = scriptedClient([
      { ids: ['thread.archive'], tokenCost: 10, model: 'gemini-2.5-flash' },
      { ids: ['thread.list'], tokenCost: 8, model: 'gemini-2.5-flash' },
    ]);
    const r = new TwoStageCapabilityResolver({ client });
    await r.scope({ ...REQ, intent: 'archive' }, 5, caps());
    await r.scope({ ...REQ, intent: 'list' }, 5, caps());
    expect(requests).toHaveLength(2);
  });

  it('cascades to fallback resolver when stage-1 throws', async () => {
    const { client } = scriptedClient([new Error('boom')]);
    const failureSpy = vi.fn();
    const r = new TwoStageCapabilityResolver({
      client,
      onStageOneFailure: failureSpy,
    });
    // The substring fallback finds `thread.archive` from the intent.
    const refs = await r.scope(REQ, 5, caps());
    expect(refs.map((c) => c.id)).toContain('thread.archive');
    expect(failureSpy).toHaveBeenCalledOnce();
  });

  it('does NOT cache fallback results', async () => {
    const { client, requests } = scriptedClient([
      new Error('first call fails'),
      { ids: ['thread.archive'], tokenCost: 10, model: 'gemini-2.5-flash' },
    ]);
    const r = new TwoStageCapabilityResolver({ client });
    await r.scope(REQ, 5, caps()); // throws → fallback
    await r.scope(REQ, 5, caps()); // should retry stage-1, not serve fallback
    expect(requests).toHaveLength(2);
  });

  it('treats "no usable ids" stage-1 response as failure', async () => {
    const { client } = scriptedClient([
      { ids: ['hallucinated.one', 'hallucinated.two'], tokenCost: 5, model: 'gemini-2.5-flash' },
    ]);
    const failureSpy = vi.fn();
    const fallback = new SubstringCapabilityResolver();
    const r = new TwoStageCapabilityResolver({
      client,
      fallback,
      onStageOneFailure: failureSpy,
    });
    const refs = await r.scope(REQ, 5, caps());
    expect(failureSpy).toHaveBeenCalledOnce();
    // Substring fallback recovered something from the intent.
    expect(refs.map((c) => c.id)).toContain('thread.archive');
  });

  it('fires recordTokens on success only', async () => {
    const { client } = scriptedClient([
      { ids: ['thread.archive'], tokenCost: 99, model: 'gemini-2.5-flash' },
      new Error('second call'),
    ]);
    const recorded: Array<{ userId: string; appId: string; tokens: number }> = [];
    const r = new TwoStageCapabilityResolver({
      client,
      recordTokens: (e) => recorded.push(e),
    });
    await r.scope(REQ, 5, caps());
    await r.scope({ ...REQ, intent: 'list inbox' }, 5, caps());
    expect(recorded).toEqual([{ userId: 'u1', appId: 'a1', tokens: 99 }]);
  });

  it('observers that throw do not poison the resolver', async () => {
    const { client } = scriptedClient([
      { ids: ['thread.archive'], tokenCost: 1, model: 'gemini-2.5-flash' },
    ]);
    const r = new TwoStageCapabilityResolver({
      client,
      onScope: () => {
        throw new Error('observer boom');
      },
      recordTokens: () => {
        throw new Error('record boom');
      },
    });
    const refs = await r.scope(REQ, 5, caps());
    expect(refs.map((c) => c.id)).toContain('thread.archive');
  });

  it('returns [] for empty intent and k<=0', async () => {
    const { client, requests } = scriptedClient([]);
    const r = new TwoStageCapabilityResolver({ client });
    expect(await r.scope({ ...REQ, intent: '' }, 5, caps())).toEqual([]);
    expect(await r.scope(REQ, 0, caps())).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it('id defaults to "two-stage[<client.id>]", overridable', () => {
    const { client } = scriptedClient([]);
    const r = new TwoStageCapabilityResolver({ client });
    expect(r.id).toBe('two-stage[mock-flash]');
    const r2 = new TwoStageCapabilityResolver({ client, id: 'custom-resolver' });
    expect(r2.id).toBe('custom-resolver');
  });

  it('summarizes registry descriptions onto a single line for the model', async () => {
    const { client, requests } = scriptedClient([
      { ids: ['thread.archive'], tokenCost: 1, model: 'gemini-2.5-flash' },
    ]);
    const r = new TwoStageCapabilityResolver({ client });
    const longDesc =
      'Archive a thread (reversible).\nThis can be undone via thread.unarchive within the undo window.';
    const reg: Record<string, Capability> = {
      'thread.archive': {
        id: 'thread.archive',
        kind: 'action',
        version: '1.0.0',
        description: longDesc,
      } as unknown as Capability,
    };
    await r.scope(REQ, 5, reg);
    expect(requests[0]?.summaries[0]?.summary).toBe('Archive a thread (reversible).');
  });
});
