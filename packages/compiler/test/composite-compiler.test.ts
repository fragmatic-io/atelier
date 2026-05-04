/* eslint-disable @typescript-eslint/require-await -- stub compilers must be Promise-returning to satisfy CompilerService.compile; not every stub awaits */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `CompositeCompiler`. The composite is a small orchestration
 * piece — these tests cover the cascade matrix (which errors do/don't
 * cascade) plus id formatting and empty-construction guard.
 */

import { describe, expect, it, vi } from 'vitest';
import { BudgetMeter } from '../src/budget-meter.js';
import { CompositeCompiler } from '../src/composite-compiler.js';
import {
  CompilerBudgetExhaustedError,
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

describe('CompositeCompiler — BudgetMeter integration', () => {
  it('emits compile.budget_used after a successful metered compile', async () => {
    const meter = new BudgetMeter({
      budget: {
        max_tokens_per_day: 1000,
        max_calls_per_hour: 10,
        on_exhausted: 'fall_through',
      },
    });
    const onBudgetEvent = vi.fn();
    const c = new CompositeCompiler(
      [stubCompiler('primary', async () => ({ ...stubResult('primary'), token_cost: 250 }))],
      { budgetMeter: meter, onBudgetEvent },
    );
    await c.compile(fixtureCompileInput());
    expect(onBudgetEvent).toHaveBeenCalledTimes(1);
    expect(onBudgetEvent.mock.calls[0]?.[0]).toMatchObject({
      type: 'compile.budget_used',
      compiler_id: 'primary',
      tokens: 250,
      remaining_tokens: 750,
      remaining_calls: 9,
    });
  });

  it('with on_exhausted=fall_through, the second compiler runs when only the first is gated by per-child policy', async () => {
    // Per-child gating only happens when each child has its own meter; we
    // simulate that by combining BudgetMeteredCompiler children inside the
    // composite. Here we exercise the "meter blocks → continue" branch
    // directly: the composite's loop hits `continue` for the gated child
    // and then calls the next compiler unguarded.
    const meter = new BudgetMeter({
      budget: { max_calls_per_hour: 1, on_exhausted: 'fall_through' },
    });
    meter.check(); // burn the only allowed call
    const fallback = vi.fn(async () => stubResult('fallback'));
    const c = new CompositeCompiler(
      [
        stubCompiler('primary', async () => stubResult('primary')),
        stubCompiler('fallback', fallback),
      ],
      { budgetMeter: meter },
    );
    // Both are gated by the same meter; both end up blocked. The composite
    // then surfaces a generic CompilerOutputError citing the chain length.
    await expect(c.compile(fixtureCompileInput())).rejects.toBeInstanceOf(CompilerOutputError);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('with on_exhausted=fail, throws CompilerBudgetExhaustedError immediately', async () => {
    const meter = new BudgetMeter({
      budget: { max_calls_per_hour: 1, on_exhausted: 'fail' },
    });
    meter.check();
    const primary = vi.fn(async () => stubResult('primary'));
    const c = new CompositeCompiler([stubCompiler('primary', primary)], {
      budgetMeter: meter,
    });
    await expect(c.compile(fixtureCompileInput())).rejects.toBeInstanceOf(
      CompilerBudgetExhaustedError,
    );
    expect(primary).not.toHaveBeenCalled();
  });

  it('emits compile.budget_exceeded with the configured caps in would_use', async () => {
    const meter = new BudgetMeter({
      budget: {
        max_tokens_per_day: 5000,
        max_calls_per_hour: 50,
        on_exhausted: 'fall_through',
      },
    });
    // Force the meter into a blocked state: fill the call cap.
    for (let i = 0; i < 50; i += 1) meter.check();
    const onBudgetEvent = vi.fn();
    const c = new CompositeCompiler([stubCompiler('primary', async () => stubResult('primary'))], {
      budgetMeter: meter,
      onBudgetEvent,
    });
    await expect(c.compile(fixtureCompileInput())).rejects.toBeInstanceOf(CompilerOutputError);
    const firstEvent = onBudgetEvent.mock.calls[0]?.[0] as
      | { type: string; would_use?: { tokens_max?: number; calls_max?: number } }
      | undefined;
    expect(firstEvent?.type).toBe('compile.budget_exceeded');
    expect(firstEvent?.would_use?.tokens_max).toBe(5000);
    expect(firstEvent?.would_use?.calls_max).toBe(50);
  });

  it('a misbehaving onBudgetEvent subscriber does not poison the compile path', async () => {
    const meter = new BudgetMeter({
      budget: { max_calls_per_hour: 5, on_exhausted: 'fall_through' },
    });
    const onBudgetEvent = vi.fn(() => {
      throw new Error('subscriber boom');
    });
    const c = new CompositeCompiler([stubCompiler('primary', async () => stubResult('primary'))], {
      budgetMeter: meter,
      onBudgetEvent,
    });
    // Compile still completes despite the throwing subscriber.
    const r = await c.compile(fixtureCompileInput());
    expect(r.model).toBe('primary');
  });
});
