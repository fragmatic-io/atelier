/* eslint-disable @typescript-eslint/require-await -- stub compilers must be Promise-returning to satisfy CompilerService.compile; not every stub awaits */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `CompositeCompiler`. The composite is a small orchestration
 * piece — these tests cover the cascade matrix (which errors do/don't
 * cascade) plus id formatting and empty-construction guard.
 */

import { describe, expect, it, vi } from 'vitest';
import { CompositeCompiler } from '../src/composite-compiler.js';
import {
  CompilerOutputError,
  CompilerUnavailableError,
  type CompilerService,
  type CompileResult,
} from '../src/types.js';
import { fixtureCompileInput, fixtureManifest } from './_fixtures.js';

function stubResult(model: string): CompileResult {
  return {
    manifest: fixtureManifest(),
    token_cost: 0,
    duration_ms: 1,
    model,
    diff_mode: false,
  };
}

function stubCompiler(id: string, behavior: () => Promise<CompileResult>): CompilerService {
  return { id, compile: behavior };
}

describe('CompositeCompiler', () => {
  it('throws when constructed with an empty list', () => {
    expect(() => new CompositeCompiler([])).toThrow(/at least one compiler/);
  });

  it('returns the primary result without invoking the fallback on success', async () => {
    const fallbackCompile = vi.fn(async () => stubResult('fallback'));
    const c = new CompositeCompiler([
      stubCompiler('primary', async () => stubResult('primary')),
      stubCompiler('fallback', fallbackCompile),
    ]);

    const r = await c.compile(fixtureCompileInput());
    expect(r.model).toBe('primary');
    expect(fallbackCompile).not.toHaveBeenCalled();
  });

  it('cascades on CompilerUnavailableError and fires onCascade', async () => {
    const onCascade = vi.fn();
    const c = new CompositeCompiler(
      [
        stubCompiler('primary', () => Promise.reject(new CompilerUnavailableError('no key'))),
        stubCompiler('fallback', async () => stubResult('fallback')),
      ],
      { onCascade },
    );

    const r = await c.compile(fixtureCompileInput());
    expect(r.model).toBe('fallback');
    expect(onCascade).toHaveBeenCalledTimes(1);
    expect(onCascade.mock.calls[0]?.[0]).toBe('primary');
  });

  it('cascades on CompilerOutputError', async () => {
    const c = new CompositeCompiler([
      stubCompiler('primary', () => Promise.reject(new CompilerOutputError('bad', null))),
      stubCompiler('fallback', async () => stubResult('fallback')),
    ]);
    const r = await c.compile(fixtureCompileInput());
    expect(r.model).toBe('fallback');
  });

  it('cascades on a generic Error by default', async () => {
    const c = new CompositeCompiler([
      stubCompiler('primary', () => Promise.reject(new Error('network'))),
      stubCompiler('fallback', async () => stubResult('fallback')),
    ]);
    const r = await c.compile(fixtureCompileInput());
    expect(r.model).toBe('fallback');
  });

  it('does NOT cascade on CompilerUnavailableError when cascadeOnUnavailable=false', async () => {
    const fallbackCompile = vi.fn(async () => stubResult('fallback'));
    const c = new CompositeCompiler(
      [
        stubCompiler('primary', () => Promise.reject(new CompilerUnavailableError('no key'))),
        stubCompiler('fallback', fallbackCompile),
      ],
      { cascadeOnUnavailable: false },
    );
    await expect(c.compile(fixtureCompileInput())).rejects.toBeInstanceOf(CompilerUnavailableError);
    expect(fallbackCompile).not.toHaveBeenCalled();
  });

  it('throws CompilerOutputError citing the chain length when all compilers fail', async () => {
    const c = new CompositeCompiler([
      stubCompiler('a', () => Promise.reject(new CompilerOutputError('a-bad', null))),
      stubCompiler('b', () => Promise.reject(new CompilerOutputError('b-bad', null))),
    ]);
    try {
      await c.compile(fixtureCompileInput());
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CompilerOutputError);
      expect((err as Error).message).toContain('2');
    }
  });

  it('id is formatted with all child compiler ids', () => {
    const c = new CompositeCompiler([
      stubCompiler('a', async () => stubResult('a')),
      stubCompiler('b', async () => stubResult('b')),
    ]);
    expect(c.id).toBe('composite[a,b]');
  });
});
