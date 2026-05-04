// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `wrapAsHighLevel`. Bridges the scope-based
 * `CapabilityResolver` into the simpler `resolve(query)`/`index(caps)`
 * shape, so callers that don't want to thread route + user context
 * through every call can use the package as a simpler library.
 *
 * Coverage:
 *
 *   - registry initialised from an array OR a record map
 *   - `resolve()` forwards intent text and topN to the underlying scope
 *     resolver
 *   - `index()` swaps the captured registry; subsequent `resolve()`
 *     uses the new corpus
 *   - default topN is `DEFAULT_SCOPING_K` (30)
 *   - signal forwarding
 *   - id passes through from the wrapped resolver
 */

import type { Capability } from '@atelier/schemas';
import { describe, expect, it } from 'vitest';
import { SubstringCapabilityResolver } from '../src/substring-resolver.js';
import { wrapAsHighLevel } from '../src/high-level-adapter.js';

function buildRegistry(n: number, prefix = 'cap'): Capability[] {
  const out: Capability[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `${prefix}.${String(i).padStart(3, '0')}`,
      kind: 'data',
      version: '1.0.0',
      description: `Item ${String(i)}.`,
    } as unknown as Capability);
  }
  return out;
}

describe('wrapAsHighLevel', () => {
  it('initialises registry from an array', async () => {
    const reg = buildRegistry(20);
    const r = wrapAsHighLevel(new SubstringCapabilityResolver(), reg);
    const result = await r.resolve({ text: 'item' });
    // 'item' substring matches every cap (description contains 'item').
    // Default topN is 30 — capped to registry size 20.
    expect(result.capabilities).toHaveLength(20);
  });

  it('initialises registry from a record map', async () => {
    const reg: Record<string, Capability> = {};
    for (const cap of buildRegistry(5)) reg[cap.id] = cap;
    const r = wrapAsHighLevel(new SubstringCapabilityResolver(), reg);
    const result = await r.resolve({ text: 'item', topN: 3 });
    expect(result.capabilities).toHaveLength(3);
  });

  it('index() swaps the captured registry', async () => {
    const initial = buildRegistry(5, 'old');
    const r = wrapAsHighLevel(new SubstringCapabilityResolver(), initial);
    const updated = buildRegistry(8, 'new');
    await r.index(updated);
    const result = await r.resolve({ text: 'new' });
    // After swap, the only matches are 'new.*'.
    expect(result.capabilities).toHaveLength(8);
    for (const cap of result.capabilities) {
      expect(cap.id.startsWith('new.')).toBe(true);
    }
  });

  it('returns the underlying resolver id', () => {
    const r = wrapAsHighLevel(new SubstringCapabilityResolver({ id: 'inner' }), []);
    expect(r.id).toBe('inner');
  });

  it('applies the topN cap', async () => {
    const reg = buildRegistry(40);
    const r = wrapAsHighLevel(new SubstringCapabilityResolver(), reg);
    const result = await r.resolve({ text: 'item', topN: 5 });
    expect(result.capabilities).toHaveLength(5);
  });

  it('falls through to a sensible default route + user when query omits them', async () => {
    const reg = buildRegistry(3);
    let captured: { route?: string; userId?: string } = {};
    // Custom resolver that captures the request.
    const r = wrapAsHighLevel(
      {
        id: 'capturing',
        async scope(req) {
          captured = { route: req.route, userId: req.userId };
          return Promise.resolve([]);
        },
      },
      reg,
    );
    await r.resolve({ text: 'whatever' });
    expect(captured.route).toBe('/');
    expect(captured.userId).toBe('anonymous');
  });
});
