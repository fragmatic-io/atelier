/* eslint-disable @typescript-eslint/require-await -- stub compilers must be Promise-returning to satisfy CompilerService.compile; not every stub awaits */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the Wave 10 S-6 budget metering surface:
 *
 *   - `InMemoryBudgetCounter` — per-(user, app) rolling-window counter
 *   - `BudgetMeteredCompiler` — wraps an inner CompilerService, gates on
 *     `CompileBudget`, throws `BudgetExceededError` (with a `code`
 *     discriminator) on a pre-call breach
 *   - `mergeCompileBudgets` — stricter-wins merge across intent + brand kit
 *   - `CompositeCompiler` cascades on `BudgetExceededError` so a metered
 *     LLM tier blowing its budget doesn't take the whole compile down
 *
 * These tests deliberately avoid touching the resolver-level
 * `BudgetExceededError` path — that's covered in `server-resolver.test.ts`.
 * The shared `BudgetExceededError` class is used by both layers; we just
 * verify here that the `code` discriminator propagates as expected.
 */

import type { CompileBudget } from '@atelier/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  BudgetMeteredCompiler,
  InMemoryBudgetCounter,
  mergeCompileBudgets,
} from '../src/budget-meter.js';
import { CompositeCompiler } from '../src/composite-compiler.js';
import { BudgetExceededError } from '../src/server-resolver.js';
import { type CompileInput, type CompileResult, type CompilerService } from '../src/types.js';
import { fixtureCompileInput, fixtureManifest } from './_fixtures.js';

function stubResult(overrides: Partial<CompileResult> = {}): CompileResult {
  return {
    manifest: fixtureManifest(),
    token_cost: 100,
    duration_ms: 1,
    model: 'stub',
    diff_mode: false,
    ...overrides,
  };
}

function stubCompiler(
  id: string,
  behavior: (input: CompileInput) => Promise<CompileResult>,
): CompilerService {
  return { id, compile: behavior };
}

describe('InMemoryBudgetCounter', () => {
  it('records and reads tokens within the 24h window', () => {
    const c = new InMemoryBudgetCounter();
    expect(c.tokensInWindow('u1', 'app')).toBe(0);
    c.record('u1', 'app', 100);
    c.record('u1', 'app', 250);
    expect(c.tokensInWindow('u1', 'app')).toBe(350);
  });

  it('records and reads call counts within the 1h window', () => {
    const c = new InMemoryBudgetCounter();
    expect(c.callsInWindow('u1', 'app')).toBe(0);
    c.record('u1', 'app', 0);
    c.record('u1', 'app', 0);
    c.record('u1', 'app', 0);
    expect(c.callsInWindow('u1', 'app')).toBe(3);
  });

  it('isolates counts per (user, app) tuple', () => {
    const c = new InMemoryBudgetCounter();
    c.record('u1', 'app1', 100);
    c.record('u2', 'app1', 200);
    c.record('u1', 'app2', 50);
    expect(c.tokensInWindow('u1', 'app1')).toBe(100);
    expect(c.tokensInWindow('u2', 'app1')).toBe(200);
    expect(c.tokensInWindow('u1', 'app2')).toBe(50);
    expect(c.callsInWindow('u1', 'app1')).toBe(1);
  });

  it('prunes token samples older than the 24h window', () => {
    let now = 1_000_000_000_000;
    const c = new InMemoryBudgetCounter({ now: () => now });
    c.record('u1', 'app', 500);
    expect(c.tokensInWindow('u1', 'app')).toBe(500);
    // Advance > 24h.
    now += 25 * 60 * 60 * 1000;
    expect(c.tokensInWindow('u1', 'app')).toBe(0);
  });

  it('prunes call samples older than the 1h window', () => {
    let now = 1_000_000_000_000;
    const c = new InMemoryBudgetCounter({ now: () => now });
    c.record('u1', 'app', 100);
    c.record('u1', 'app', 200);
    expect(c.callsInWindow('u1', 'app')).toBe(2);
    // Advance > 1h. Token window (24h) still includes them.
    now += 65 * 60 * 1000;
    expect(c.callsInWindow('u1', 'app')).toBe(0);
    expect(c.tokensInWindow('u1', 'app')).toBe(300);
  });

  it('clamps non-finite / non-positive token values to zero', () => {
    const c = new InMemoryBudgetCounter();
    c.record('u1', 'app', -100);
    c.record('u1', 'app', Number.NaN);
    c.record('u1', 'app', Number.POSITIVE_INFINITY);
    expect(c.tokensInWindow('u1', 'app')).toBe(0);
    // But the calls are still counted — the call happened, the cost just
    // didn't.
    expect(c.callsInWindow('u1', 'app')).toBe(3);
  });

  it('reset() clears all state', () => {
    const c = new InMemoryBudgetCounter();
    c.record('u1', 'app', 100);
    c.record('u2', 'app', 200);
    c.reset();
    expect(c.tokensInWindow('u1', 'app')).toBe(0);
    expect(c.tokensInWindow('u2', 'app')).toBe(0);
  });
});

describe('BudgetMeteredCompiler', () => {
  it('delegates to the inner compiler when under budget', async () => {
    const counter = new InMemoryBudgetCounter();
    const inner = vi.fn(async () => stubResult({ token_cost: 50, model: 'inner' }));
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('inner', inner),
      counter,
      budget: { max_tokens_per_day: 1000, max_calls_per_hour: 10, on_exhausted: 'fall_through' },
    });

    const r = await c.compile(fixtureCompileInput());
    expect(r.model).toBe('inner');
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('records token_cost on the counter after a successful compile', async () => {
    const counter = new InMemoryBudgetCounter();
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('inner', async () => stubResult({ token_cost: 77 })),
      counter,
      budget: { max_tokens_per_day: 10_000, on_exhausted: 'fall_through' },
    });
    await c.compile(fixtureCompileInput({ user_id: 'u1', app_id: 'cir.demo' }));
    expect(counter.tokensInWindow('u1', 'cir.demo')).toBe(77);
    expect(counter.callsInWindow('u1', 'cir.demo')).toBe(1);
  });

  it('does NOT record on inner failure', async () => {
    const counter = new InMemoryBudgetCounter();
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('inner', () => Promise.reject(new Error('boom'))),
      counter,
      budget: { max_tokens_per_day: 10_000, on_exhausted: 'fall_through' },
    });
    await expect(c.compile(fixtureCompileInput({ user_id: 'u1' }))).rejects.toThrow('boom');
    expect(counter.tokensInWindow('u1', 'cir.demo')).toBe(0);
    expect(counter.callsInWindow('u1', 'cir.demo')).toBe(0);
  });

  it('throws BudgetExceededError(code=tokens_per_day) when over the daily token cap', async () => {
    const counter = new InMemoryBudgetCounter();
    counter.record('u1', 'cir.demo', 10_000);
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('inner', async () => stubResult()),
      counter,
      budget: { max_tokens_per_day: 5000, on_exhausted: 'fall_through' },
    });

    try {
      await c.compile(fixtureCompileInput({ user_id: 'u1' }));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BudgetExceededError);
      const e = err as BudgetExceededError;
      expect(e.code).toBe('tokens_per_day');
      expect(e.consumed).toBe(10_000);
      expect(e.cap).toBe(5000);
      expect(e.user_id).toBe('u1');
    }
  });

  it('throws BudgetExceededError(code=calls_per_hour) when over the hourly call cap', async () => {
    const counter = new InMemoryBudgetCounter();
    for (let i = 0; i < 5; i += 1) counter.record('u1', 'cir.demo', 0);
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('inner', async () => stubResult()),
      counter,
      budget: { max_calls_per_hour: 5, on_exhausted: 'fall_through' },
    });

    try {
      await c.compile(fixtureCompileInput({ user_id: 'u1' }));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BudgetExceededError);
      expect((err as BudgetExceededError).code).toBe('calls_per_hour');
    }
  });

  it('checks calls_per_hour BEFORE tokens_per_day so the call limit fires first', async () => {
    // A user that has exactly used both budgets up should report calls_per_hour
    // (the cheaper-to-check axis fires first; this is documented behaviour).
    const counter = new InMemoryBudgetCounter();
    counter.record('u1', 'cir.demo', 500);
    counter.record('u1', 'cir.demo', 500);
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('inner', async () => stubResult()),
      counter,
      budget: { max_tokens_per_day: 1000, max_calls_per_hour: 2, on_exhausted: 'fall_through' },
    });
    await expect(c.compile(fixtureCompileInput({ user_id: 'u1' }))).rejects.toMatchObject({
      code: 'calls_per_hour',
    });
  });

  it('fires onExceeded with the breach reason before throwing', async () => {
    const counter = new InMemoryBudgetCounter();
    counter.record('u1', 'cir.demo', 10_000);
    const onExceeded = vi.fn();
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('inner', async () => stubResult()),
      counter,
      budget: { max_tokens_per_day: 5000, on_exhausted: 'fall_through' },
      onExceeded,
    });

    await expect(c.compile(fixtureCompileInput({ user_id: 'u1' }))).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    expect(onExceeded).toHaveBeenCalledTimes(1);
    expect(onExceeded.mock.calls[0]?.[0]).toMatchObject({
      code: 'tokens_per_day',
      observed: 10_000,
      cap: 5000,
    });
  });

  it('logs onExceeded(tokens_per_call) AFTER the call when the per-call cap is exceeded', async () => {
    const counter = new InMemoryBudgetCounter();
    const onExceeded = vi.fn();
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('inner', async () => stubResult({ token_cost: 9999 })),
      counter,
      budget: { max_tokens_per_call: 1000, on_exhausted: 'fall_through' },
      onExceeded,
    });
    const result = await c.compile(fixtureCompileInput({ user_id: 'u1' }));
    // The compile still returned its manifest — the per-call cap is a soft
    // warning, not a retroactive rejection.
    expect(result.token_cost).toBe(9999);
    expect(onExceeded).toHaveBeenCalledTimes(1);
    expect(onExceeded.mock.calls[0]?.[0]).toMatchObject({
      code: 'tokens_per_call',
      observed: 9999,
      cap: 1000,
    });
    // And the cost was still recorded.
    expect(counter.tokensInWindow('u1', 'cir.demo')).toBe(9999);
  });

  it('uncapped axes do not block', async () => {
    // budget with NO axes set -> never blocks
    const counter = new InMemoryBudgetCounter();
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('inner', async () => stubResult({ token_cost: 1_000_000 })),
      counter,
      budget: { on_exhausted: 'fall_through' },
    });
    const r = await c.compile(fixtureCompileInput({ user_id: 'u1' }));
    expect(r.token_cost).toBe(1_000_000);
  });

  it('id is formatted as "budgeted[<inner.id>]"', () => {
    const counter = new InMemoryBudgetCounter();
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('gemini-2.5-pro', async () => stubResult()),
      counter,
      budget: { on_exhausted: 'fall_through' },
    });
    expect(c.id).toBe('budgeted[gemini-2.5-pro]');
  });

  it('a misbehaving onExceeded handler does not poison the compile path', async () => {
    const counter = new InMemoryBudgetCounter();
    counter.record('u1', 'cir.demo', 10_000);
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('inner', async () => stubResult()),
      counter,
      budget: { max_tokens_per_day: 5000, on_exhausted: 'fall_through' },
      onExceeded: () => {
        throw new Error('handler boom');
      },
    });
    // The BudgetExceededError still propagates; the swallowed handler error
    // doesn't replace it.
    await expect(c.compile(fixtureCompileInput({ user_id: 'u1' }))).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });

  it('does NOT throw on tokens_per_call breach — the manifest still flows', async () => {
    const counter = new InMemoryBudgetCounter();
    const c = new BudgetMeteredCompiler({
      inner: stubCompiler('inner', async () => stubResult({ token_cost: 99_999 })),
      counter,
      budget: { max_tokens_per_call: 100, on_exhausted: 'fall_through' },
    });
    // Specifically: rejects.toThrow would fail the test if the compile
    // completed normally, which is what we want.
    const r = await c.compile(fixtureCompileInput({ user_id: 'u1' }));
    expect(r.token_cost).toBe(99_999);
  });
});

describe('CompositeCompiler cascades on BudgetExceededError', () => {
  it('advances to the next compiler when the metered child throws', async () => {
    const counter = new InMemoryBudgetCounter();
    counter.record('u1', 'cir.demo', 10_000);
    const inner = vi.fn(async () => stubResult({ model: 'gemini' }));
    const fallback = vi.fn(async () => stubResult({ model: 'fallback-generic' }));
    const onCascade = vi.fn();

    const composite = new CompositeCompiler(
      [
        new BudgetMeteredCompiler({
          inner: stubCompiler('gemini', inner),
          counter,
          budget: { max_tokens_per_day: 5000, on_exhausted: 'fall_through' },
        }),
        stubCompiler('fallback-generic', fallback),
      ],
      { onCascade },
    );

    const r = await composite.compile(fixtureCompileInput({ user_id: 'u1' }));
    // The Gemini child never ran (budget gate threw before delegating).
    expect(inner).not.toHaveBeenCalled();
    // The fallback ran — the user still gets a manifest.
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(r.model).toBe('fallback-generic');
    // The cascade hook saw the budget breach.
    expect(onCascade).toHaveBeenCalledTimes(1);
    expect(onCascade.mock.calls[0]?.[0]).toBe('budgeted[gemini]');
    expect(onCascade.mock.calls[0]?.[1]).toBeInstanceOf(BudgetExceededError);
  });
});

describe('mergeCompileBudgets — stricter wins per axis', () => {
  it('returns undefined when both inputs are undefined', () => {
    expect(mergeCompileBudgets(undefined, undefined)).toBeUndefined();
  });

  it('returns the only side when the other is undefined', () => {
    const a: CompileBudget = { max_tokens_per_day: 1000, on_exhausted: 'fall_through' };
    expect(mergeCompileBudgets(a, undefined)).toEqual(a);
    expect(mergeCompileBudgets(undefined, a)).toEqual(a);
  });

  it('takes the min on each axis when both are set', () => {
    const intent: CompileBudget = {
      max_tokens_per_day: 50_000,
      max_calls_per_hour: 200,
      max_tokens_per_call: 30_000,
      on_exhausted: 'fall_through',
    };
    const brand: CompileBudget = {
      max_tokens_per_day: 100_000,
      max_calls_per_hour: 50,
      max_tokens_per_call: 20_000,
      on_exhausted: 'fall_through',
    };
    expect(mergeCompileBudgets(intent, brand)).toEqual({
      max_tokens_per_day: 50_000, // intent stricter
      max_calls_per_hour: 50, // brand stricter
      max_tokens_per_call: 20_000, // brand stricter
      on_exhausted: 'fall_through',
    });
  });

  it('preserves an axis set on only one side', () => {
    const intent: CompileBudget = { max_tokens_per_day: 1000, on_exhausted: 'fall_through' };
    const brand: CompileBudget = { max_calls_per_hour: 10, on_exhausted: 'fall_through' };
    expect(mergeCompileBudgets(intent, brand)).toEqual({
      max_tokens_per_day: 1000,
      max_calls_per_hour: 10,
      on_exhausted: 'fall_through',
    });
  });

  it('escalates on_exhausted to "fail" when either side asks for it', () => {
    const a: CompileBudget = { on_exhausted: 'fall_through' };
    const b: CompileBudget = { on_exhausted: 'fail' };
    expect(mergeCompileBudgets(a, b)?.on_exhausted).toBe('fail');
    expect(mergeCompileBudgets(b, a)?.on_exhausted).toBe('fail');
  });

  it('keeps fall_through when neither side asks for fail', () => {
    const a: CompileBudget = { on_exhausted: 'fall_through' };
    const b: CompileBudget = { on_exhausted: 'fall_through' };
    expect(mergeCompileBudgets(a, b)?.on_exhausted).toBe('fall_through');
  });
});

describe('BudgetExceededError carries a code discriminator', () => {
  it('defaults to tokens_per_day for back-compat with the resolver guard', () => {
    const e = new BudgetExceededError('over', 'u1', 100, 50);
    expect(e.code).toBe('tokens_per_day');
  });

  it('honours an explicit code', () => {
    const e = new BudgetExceededError('over', 'u1', 100, 50, 'calls_per_hour');
    expect(e.code).toBe('calls_per_hour');
  });
});
