// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `SubstringCapabilityResolver`. The resolver is the cheap,
 * deterministic baseline for capability scoping. We assert:
 *
 *   - tokenization rules (whitespace split, lowercase, min-length filter)
 *   - score ranking (more matched terms wins; insertion order breaks ties)
 *   - bounds (k clamps the result; empty intent / k=0 short-circuits)
 *   - capability with no description still ranks on id alone
 *   - `id` option overrides the default identifier
 */

import type { Capability } from '@atelier/schemas';
import { describe, expect, it } from 'vitest';
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
    'naked.id': {
      id: 'naked.id',
      kind: 'data',
      version: '1.0.0',
    } as unknown as Capability,
  };
}

const REQ = { intent: '', route: '/today', userId: 'u1', appId: 'a1' };

describe('SubstringCapabilityResolver', () => {
  it('returns more-matched terms first (score ranking)', async () => {
    const r = new SubstringCapabilityResolver();
    const result = await r.scope({ ...REQ, intent: 'archive thread' }, 5, caps());
    expect(result[0]?.id).toBe('thread.archive');
    expect(result[1]?.id).toBe('thread.list');
    // `github.issue.list` has neither "archive" nor "thread"; absent.
    expect(result.find((c) => c.id === 'github.issue.list')).toBeUndefined();
  });

  it('falls back to insertion order on ties', async () => {
    const r = new SubstringCapabilityResolver();
    // "list" matches `thread.list` and `github.issue.list` once each.
    const result = await r.scope({ ...REQ, intent: 'list' }, 5, caps());
    const ids = result.map((c) => c.id);
    // Insertion order in the registry: thread.archive, thread.list,
    // github.issue.list. `thread.archive` doesn't match. So ties yield
    // `thread.list` before `github.issue.list`.
    expect(ids).toEqual(['thread.list', 'github.issue.list']);
  });

  it('clamps the result to k', async () => {
    const r = new SubstringCapabilityResolver();
    const result = await r.scope({ ...REQ, intent: 'list' }, 1, caps());
    expect(result).toHaveLength(1);
  });

  it('returns [] for empty intent', async () => {
    const r = new SubstringCapabilityResolver();
    expect(await r.scope({ ...REQ, intent: '' }, 5, caps())).toEqual([]);
    expect(await r.scope({ ...REQ, intent: '   ' }, 5, caps())).toEqual([]);
  });

  it('returns [] for k=0 or k<0', async () => {
    const r = new SubstringCapabilityResolver();
    expect(await r.scope({ ...REQ, intent: 'list' }, 0, caps())).toEqual([]);
    expect(await r.scope({ ...REQ, intent: 'list' }, -1, caps())).toEqual([]);
  });

  it('drops too-short tokens (default minTermLength=2)', async () => {
    const r = new SubstringCapabilityResolver();
    // "a" alone would substring-match every id; with the default filter
    // it drops out and the result is empty.
    expect(await r.scope({ ...REQ, intent: 'a' }, 5, caps())).toEqual([]);
    // ...but a normal token still works.
    const ok = await r.scope({ ...REQ, intent: 'archive' }, 5, caps());
    expect(ok[0]?.id).toBe('thread.archive');
  });

  it('honours minTermLength override', async () => {
    const r = new SubstringCapabilityResolver({ minTermLength: 1 });
    // With `minTermLength: 1`, "a" matches every id containing the
    // letter "a". `thread.archive` has the longest run of "a"-bearing
    // matches — but for this test we just want to confirm something
    // returns.
    const result = await r.scope({ ...REQ, intent: 'a' }, 5, caps());
    expect(result.length).toBeGreaterThan(0);
  });

  it('matches id-only when description is absent', async () => {
    const r = new SubstringCapabilityResolver();
    const result = await r.scope({ ...REQ, intent: 'naked' }, 5, caps());
    expect(result.map((c) => c.id)).toContain('naked.id');
    // No description → result has no `description` field.
    const naked = result.find((c) => c.id === 'naked.id')!;
    expect(naked.description).toBeUndefined();
  });

  it('preserves descriptions in returned refs', async () => {
    const r = new SubstringCapabilityResolver();
    const result = await r.scope({ ...REQ, intent: 'archive' }, 5, caps());
    expect(result[0]?.description).toBe('Archive a thread (reversible).');
  });

  it('id defaults to "substring", overridable', () => {
    expect(new SubstringCapabilityResolver().id).toBe('substring');
    expect(new SubstringCapabilityResolver({ id: 'custom-fallback' }).id).toBe('custom-fallback');
  });

  it('returns top-30 from a 200-capability fixture for a known query', async () => {
    // Build a 200-cap registry where every fifth id mentions "archive"
    // in either id or description. The substring resolver should rank
    // those above the rest. We assert top-30 contains all 40 archive-
    // bearing matches up to the cap.
    const reg: Record<string, Capability> = {};
    for (let i = 0; i < 200; i++) {
      const id = `cap.${String(i).padStart(3, '0')}`;
      const isArchive = i % 5 === 0;
      reg[id] = {
        id,
        kind: 'action',
        version: '1.0.0',
        description: isArchive
          ? `Archive item number ${String(i)}`
          : `Item number ${String(i)} (unrelated).`,
      } as unknown as Capability;
    }
    const r = new SubstringCapabilityResolver();
    const result = await r.scope({ ...REQ, intent: 'archive' }, 30, reg);
    expect(result).toHaveLength(30);
    // Every one of the top-30 is an archive-bearing capability (every
    // 5th id is i*5: 0, 5, 10, ..., 145 for the first 30).
    for (const ref of result) {
      const idx = Number(ref.id.slice(4));
      expect(idx % 5).toBe(0);
    }
  });
});
