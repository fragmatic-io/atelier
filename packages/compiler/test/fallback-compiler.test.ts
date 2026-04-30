// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `FallbackCompiler`. The fallback is a thin wrapper around a
 * lookup function — these tests cover the "found", "not found", and "custom
 * id" paths.
 */

import { describe, expect, it } from 'vitest';
import { FallbackCompiler } from '../src/fallback-compiler.ts';
import { CompilerOutputError } from '../src/types.ts';
import { fixtureCompileInput, fixtureManifest } from './_fixtures.ts';

describe('FallbackCompiler', () => {
  it('returns the manifest from lookup with token_cost 0 and default id', async () => {
    const m = fixtureManifest();
    const c = new FallbackCompiler({ lookup: () => m });
    const r = await c.compile(fixtureCompileInput({ route: '/today' }));

    expect(r.manifest).toBe(m);
    expect(r.token_cost).toBe(0);
    expect(r.diff_mode).toBe(false);
    expect(r.model).toBe('fallback');
    expect(c.id).toBe('fallback');
  });

  it('throws CompilerOutputError when lookup returns null', async () => {
    const c = new FallbackCompiler({ lookup: () => null });
    await expect(c.compile(fixtureCompileInput({ route: '/missing' }))).rejects.toBeInstanceOf(
      CompilerOutputError,
    );
  });

  it('records a custom id in the result', async () => {
    const m = fixtureManifest();
    const c = new FallbackCompiler({ lookup: () => m, id: 'demo-handwritten' });
    const r = await c.compile(fixtureCompileInput());

    expect(c.id).toBe('demo-handwritten');
    expect(r.model).toBe('demo-handwritten');
  });
});
