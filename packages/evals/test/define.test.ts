// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import { defineEval, type EvalSpec } from '../src/define.js';

describe('defineEval', () => {
  it('round-trips a spec without mutation', () => {
    const spec = defineEval({
      id: 'unit/round-trip',
      description: 'identity',
      kind: 'capability',
      input: { a: 1 },
      run: ({ a }) => a + 1,
      expected: 2,
    });
    expect(spec.id).toBe('unit/round-trip');
    expect(spec.kind).toBe('capability');
    // Identity function — same reference back.
    const again = defineEval(spec);
    expect(again).toBe(spec);
  });

  it('accepts a predicate as the expected value', async () => {
    const spec: EvalSpec<number, number, number> = defineEval<number, number, number>({
      id: 'unit/predicate',
      description: 'predicate-style expected',
      kind: 'skill',
      input: 3,
      run: (n) => n * n,
      expected: (output) => output === 9,
    });
    // The runner consumes the spec — here we just assert the predicate is callable.
    expect(typeof spec.expected).toBe('function');
    const predicate = spec.expected as (n: number) => boolean | Promise<boolean>;
    const ok = await Promise.resolve(predicate(9));
    expect(ok).toBe(true);
  });

  it('preserves optional fields (tags, skip, todo, timeoutMs)', () => {
    const spec = defineEval({
      id: 'unit/optionals',
      description: 'carries optional metadata',
      kind: 'manifest',
      tags: ['p1', 'compiler'],
      timeoutMs: 5_000,
      skip: 'paused',
      input: null,
      run: () => null,
      expected: null,
    });
    expect(spec.tags).toEqual(['p1', 'compiler']);
    expect(spec.timeoutMs).toBe(5_000);
    expect(spec.skip).toBe('paused');
  });
});
