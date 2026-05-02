/* eslint-disable @typescript-eslint/require-await -- stub compilers must be Promise-returning to satisfy CompilerService.compile; not every stub awaits */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for the Wave C / Phase C-1 surface:
 *
 *   - `ValidationFeedbackCompiler` — bounded refinement loop wrapping any
 *     inner `CompilerService`. On validation failure, threads
 *     `{prior_draft, violations}` back into a refinement-mode
 *     `CompileInput` and re-prompts the SAME inner compiler before
 *     cascading.
 *
 * Strategy: drive a stub `CompilerService` whose successive responses are
 * scripted per test (mirrors the queued-response pattern in
 * `gemini-compiler.test.ts`). The validate hook is a `vi.fn()` whose
 * verdicts are also scripted. We assert:
 *
 *   - the wrapper returns the inner result unchanged when validation passes
 *     on attempt 1 (no retries, no token-cost arithmetic)
 *   - the wrapper retries on failure, sums `token_cost` + `duration_ms`
 *     across attempts, and surfaces the retry count in `reasoning`
 *   - the refinement input carries `priorDraft` + `violations` to the
 *     inner compiler
 *   - `onRetry` fires the right number of times with the right args
 *   - exhausted retries throw `CompilerOutputError` with the violations +
 *     final draft attached
 *   - `CompositeCompiler` cascades to the next compiler when the wrapper
 *     throws
 *   - a misbehaving `onRetry` handler does not poison the compile path
 */

import type { Manifest } from '@cir/schemas';
import { describe, expect, it, vi } from 'vitest';
import { CompositeCompiler } from '../src/composite-compiler.js';
import {
  CompilerOutputError,
  type CompileInput,
  type CompileResult,
  type CompilerService,
} from '../src/types.js';
import { ValidationFeedbackCompiler } from '../src/validation-feedback-compiler.js';
import { fixtureCompileInput, fixtureManifest } from './_fixtures.js';

function stubResult(overrides: Partial<CompileResult> = {}): CompileResult {
  return {
    manifest: fixtureManifest(),
    token_cost: 100,
    duration_ms: 50,
    model: 'gemini-2.5-pro',
    diff_mode: false,
    ...overrides,
  };
}

/**
 * Stub compiler whose `compile` shifts a pre-scripted result off a queue.
 * Captures the per-call `CompileInput` so tests can assert on what the
 * wrapper passed in (`priorDraft`, `violations`, etc).
 */
function scriptedCompiler(
  id: string,
  results: ReadonlyArray<CompileResult | (() => CompileResult)>,
): { compiler: CompilerService; calls: CompileInput[] } {
  const queue = [...results];
  const calls: CompileInput[] = [];
  const compiler: CompilerService = {
    id,
    compile: async (input: CompileInput) => {
      calls.push(input);
      const next = queue.shift();
      if (next === undefined) throw new Error(`scriptedCompiler ${id}: no queued result`);
      return typeof next === 'function' ? next() : next;
    },
  };
  return { compiler, calls };
}

describe('ValidationFeedbackCompiler', () => {
  it('returns the inner result unchanged when validation passes on the first attempt', async () => {
    const inner = scriptedCompiler('gemini', [stubResult({ token_cost: 250 })]);
    const validate = vi.fn(() => ({ ok: true as const }));
    const c = new ValidationFeedbackCompiler({
      inner: inner.compiler,
      validate,
    });

    const r = await c.compile(fixtureCompileInput());
    expect(r.token_cost).toBe(250);
    expect(r.model).toBe('gemini-2.5-pro');
    expect(r.reasoning).toBeUndefined();
    expect(validate).toHaveBeenCalledTimes(1);
    expect(inner.calls).toHaveLength(1);
    // First (and only) attempt is NOT a refinement — neither field is set.
    expect(inner.calls[0]?.priorDraft).toBeUndefined();
    expect(inner.calls[0]?.violations).toBeUndefined();
  });

  it('wrapper id namespaces the inner id', () => {
    const c = new ValidationFeedbackCompiler({
      inner: scriptedCompiler('gemini-2.5-pro', []).compiler,
      validate: () => ({ ok: true }),
    });
    expect(c.id).toBe('validation-feedback[gemini-2.5-pro]');
  });

  it('retries on validation failure; success on attempt 2 sums token_cost and duration_ms', async () => {
    const draft1 = fixtureManifest({ manifest_id: 'm_draft0001' });
    const draft2 = fixtureManifest({ manifest_id: 'm_draft0002' });
    const inner = scriptedCompiler('gemini', [
      stubResult({ manifest: draft1, token_cost: 100, duration_ms: 50, model: 'gemini-2.5-pro' }),
      stubResult({
        manifest: draft2,
        token_cost: 30,
        duration_ms: 20,
        model: 'gemini-2.5-flash',
        reasoning: 'patched empty Stack',
      }),
    ]);
    const validate = vi
      .fn<(m: Manifest) => { ok: boolean; reasons?: readonly string[] }>()
      .mockReturnValueOnce({ ok: false, reasons: ['Stack requires at least 1 child; got 0'] })
      .mockReturnValueOnce({ ok: true });

    const c = new ValidationFeedbackCompiler({
      inner: inner.compiler,
      validate,
      maxRetries: 2,
    });

    const r = await c.compile(fixtureCompileInput());
    // Token cost + duration are the SUM across both attempts.
    expect(r.token_cost).toBe(130);
    expect(r.duration_ms).toBe(70);
    // Final model reflects the successful (refinement) attempt.
    expect(r.model).toBe('gemini-2.5-flash');
    // Manifest is the second (corrected) draft.
    expect(r.manifest.manifest_id).toBe('m_draft0002');
    // Reasoning carries both the inner LLM's note + the framework's
    // retry annotation.
    expect(r.reasoning).toContain('patched empty Stack');
    expect(r.reasoning).toContain('retried 1x');
    expect(r.reasoning).toContain('Stack requires at least 1 child');
  });

  it('threads priorDraft + violations into the refinement-mode CompileInput', async () => {
    const draft1 = fixtureManifest({ manifest_id: 'm_draft0001' });
    const inner = scriptedCompiler('gemini', [
      stubResult({ manifest: draft1 }),
      stubResult({ manifest: fixtureManifest({ manifest_id: 'm_fixed0002' }) }),
    ]);
    const violations = ['empty Stack', 'missing empty_state'];
    const validate = vi
      .fn<(m: Manifest) => { ok: boolean; reasons?: readonly string[] }>()
      .mockReturnValueOnce({ ok: false, reasons: violations })
      .mockReturnValueOnce({ ok: true });

    const c = new ValidationFeedbackCompiler({
      inner: inner.compiler,
      validate,
      maxRetries: 2,
    });

    await c.compile(fixtureCompileInput({ user_id: 'u1', app_id: 'cir.demo' }));

    expect(inner.calls).toHaveLength(2);
    // First attempt is plain (no refinement context).
    expect(inner.calls[0]?.priorDraft).toBeUndefined();
    expect(inner.calls[0]?.violations).toBeUndefined();
    // Second attempt is refinement-mode: priorDraft is the rejected
    // manifest from attempt 1, violations is the verdict's reasons array.
    expect(inner.calls[1]?.priorDraft?.manifest_id).toBe('m_draft0001');
    expect(inner.calls[1]?.violations).toEqual(violations);
    // Other fields flow through unchanged.
    expect(inner.calls[1]?.user_id).toBe('u1');
    expect(inner.calls[1]?.app_id).toBe('cir.demo');
  });

  it('fires onRetry on each unsuccessful attempt with the right args', async () => {
    const draft1 = fixtureManifest({ manifest_id: 'm_draft0001' });
    const draft2 = fixtureManifest({ manifest_id: 'm_draft0002' });
    const inner = scriptedCompiler('gemini', [
      stubResult({ manifest: draft1 }),
      stubResult({ manifest: draft2 }),
      stubResult({ manifest: fixtureManifest({ manifest_id: 'm_ok0000003' }) }),
    ]);
    const validate = vi
      .fn<(m: Manifest) => { ok: boolean; reasons?: readonly string[] }>()
      .mockReturnValueOnce({ ok: false, reasons: ['v1'] })
      .mockReturnValueOnce({ ok: false, reasons: ['v2'] })
      .mockReturnValueOnce({ ok: true });
    const onRetry = vi.fn();

    const c = new ValidationFeedbackCompiler({
      inner: inner.compiler,
      validate,
      maxRetries: 2,
      onRetry,
    });

    await c.compile(fixtureCompileInput());
    // Two failures before the success → two onRetry calls.
    expect(onRetry).toHaveBeenCalledTimes(2);
    // Attempt is 1-indexed and refers to the upcoming retry number.
    expect(onRetry.mock.calls[0]?.[0]).toBe(1);
    expect(onRetry.mock.calls[0]?.[1]).toEqual(['v1']);
    expect((onRetry.mock.calls[0]?.[2] as Manifest).manifest_id).toBe('m_draft0001');
    expect(onRetry.mock.calls[1]?.[0]).toBe(2);
    expect(onRetry.mock.calls[1]?.[1]).toEqual(['v2']);
    expect((onRetry.mock.calls[1]?.[2] as Manifest).manifest_id).toBe('m_draft0002');
  });

  it('does NOT fire onRetry on the final exhausted attempt (the throw carries the same payload)', async () => {
    const inner = scriptedCompiler('gemini', [
      stubResult({ manifest: fixtureManifest({ manifest_id: 'm_drafta001' }) }),
      stubResult({ manifest: fixtureManifest({ manifest_id: 'm_draftb002' }) }),
    ]);
    const validate = vi.fn(() => ({ ok: false, reasons: ['boom'] }));
    const onRetry = vi.fn();

    const c = new ValidationFeedbackCompiler({
      inner: inner.compiler,
      validate,
      maxRetries: 1, // 1 initial + 1 refinement = 2 attempts, both fail
      onRetry,
    });

    await expect(c.compile(fixtureCompileInput())).rejects.toBeInstanceOf(CompilerOutputError);
    // First failure fires once (announces the upcoming retry); second
    // failure exhausts retries and throws — no fire-and-throw on the
    // same event.
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('throws CompilerOutputError carrying the final draft + violations after maxRetries+1 attempts', async () => {
    const finalDraft = fixtureManifest({ manifest_id: 'm_finalxxx1' });
    const inner = scriptedCompiler('gemini', [
      stubResult({ manifest: fixtureManifest({ manifest_id: 'm_drafta001' }) }),
      stubResult({ manifest: fixtureManifest({ manifest_id: 'm_draftb002' }) }),
      stubResult({ manifest: finalDraft }),
    ]);
    const validate = vi.fn(() => ({
      ok: false,
      reasons: ['Stack empty', 'Missing empty_state'],
    }));

    const c = new ValidationFeedbackCompiler({
      inner: inner.compiler,
      validate,
      maxRetries: 2, // 1 initial + 2 refinement = 3 total attempts
    });

    try {
      await c.compile(fixtureCompileInput());
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CompilerOutputError);
      const e = err as CompilerOutputError;
      expect(e.message).toContain('exhausted 3 attempts');
      expect(e.message).toContain('Stack empty');
      expect(e.message).toContain('Missing empty_state');
      // The cause_detail payload carries the final draft + violations
      // so audit emitters can deep-link to what the LLM produced.
      const detail = e.cause_detail as {
        violations: readonly string[];
        final_draft: Manifest;
        attempts: number;
      };
      expect(detail.violations).toEqual(['Stack empty', 'Missing empty_state']);
      expect(detail.final_draft.manifest_id).toBe('m_finalxxx1');
      expect(detail.attempts).toBe(3);
    }
    // All three attempts ran.
    expect(inner.calls).toHaveLength(3);
    expect(validate).toHaveBeenCalledTimes(3);
  });

  it('default maxRetries is 2 (= 3 total attempts)', async () => {
    const inner = scriptedCompiler('gemini', [stubResult(), stubResult(), stubResult()]);
    const validate = vi.fn(() => ({ ok: false, reasons: ['nope'] }));

    const c = new ValidationFeedbackCompiler({
      inner: inner.compiler,
      validate,
      // maxRetries omitted — should default to 2
    });

    await expect(c.compile(fixtureCompileInput())).rejects.toBeInstanceOf(CompilerOutputError);
    expect(inner.calls).toHaveLength(3);
  });

  it('CompositeCompiler cascades to the next compiler when the wrapper exhausts retries', async () => {
    const llm = scriptedCompiler('gemini', [
      stubResult({ manifest: fixtureManifest({ manifest_id: 'm_drafta001' }) }),
      stubResult({ manifest: fixtureManifest({ manifest_id: 'm_draftb002' }) }),
    ]);
    const fallbackResult = stubResult({
      manifest: fixtureManifest({ manifest_id: 'm_fallback1' }),
      model: 'fallback-generic',
      token_cost: 0,
    });
    const fallback = scriptedCompiler('fallback-generic', [fallbackResult]);

    const wrapped = new ValidationFeedbackCompiler({
      inner: llm.compiler,
      validate: () => ({ ok: false, reasons: ['always fails'] }),
      maxRetries: 1,
    });

    const composite = new CompositeCompiler([wrapped, fallback.compiler]);
    const r = await composite.compile(fixtureCompileInput());

    // The wrapper exhausted retries (2 attempts) and threw
    // CompilerOutputError; the composite caught it and advanced to the
    // fallback. The fallback was called exactly once with the ORIGINAL
    // input (refinement context is local to the wrapper, not propagated
    // out via the cascade).
    expect(r.model).toBe('fallback-generic');
    expect(r.manifest.manifest_id).toBe('m_fallback1');
    expect(llm.calls).toHaveLength(2);
    expect(fallback.calls).toHaveLength(1);
    expect(fallback.calls[0]?.priorDraft).toBeUndefined();
    expect(fallback.calls[0]?.violations).toBeUndefined();
  });

  it('a misbehaving onRetry handler does not poison the compile path', async () => {
    const inner = scriptedCompiler('gemini', [
      stubResult({ manifest: fixtureManifest({ manifest_id: 'm_drafta001' }) }),
      stubResult({ manifest: fixtureManifest({ manifest_id: 'm_oktok0001' }) }),
    ]);
    const validate = vi
      .fn<(m: Manifest) => { ok: boolean; reasons?: readonly string[] }>()
      .mockReturnValueOnce({ ok: false, reasons: ['v1'] })
      .mockReturnValueOnce({ ok: true });
    const c = new ValidationFeedbackCompiler({
      inner: inner.compiler,
      validate,
      maxRetries: 2,
      onRetry: () => {
        throw new Error('hook boom');
      },
    });
    // The hook's exception is swallowed; the wrapper still reaches the
    // success path and returns the corrected manifest.
    const r = await c.compile(fixtureCompileInput());
    expect(r.manifest.manifest_id).toBe('m_oktok0001');
  });

  it('preserves the inner compiler reasoning when the first attempt succeeds', async () => {
    const inner = scriptedCompiler('gemini', [
      stubResult({ reasoning: 'cold compile from scratch' }),
    ]);
    const c = new ValidationFeedbackCompiler({
      inner: inner.compiler,
      validate: () => ({ ok: true }),
    });
    const r = await c.compile(fixtureCompileInput());
    // No retry annotation when no retry happened.
    expect(r.reasoning).toBe('cold compile from scratch');
  });

  it('verdict ok=false with empty reasons still triggers a retry', async () => {
    // Defensive: a validator that returns `ok: false` with no reasons (or
    // an empty reasons array) is still a failure. We retry, but the
    // refinement input carries an empty violations array — the prompt
    // builder should handle that gracefully (it only renders REFINEMENT
    // MODE when violations.length > 0; empty arrays degrade to a plain
    // re-call).
    const inner = scriptedCompiler('gemini', [stubResult(), stubResult()]);
    const validate = vi
      .fn<(m: Manifest) => { ok: boolean; reasons?: readonly string[] }>()
      .mockReturnValueOnce({ ok: false })
      .mockReturnValueOnce({ ok: true });

    const c = new ValidationFeedbackCompiler({
      inner: inner.compiler,
      validate,
      maxRetries: 2,
    });
    await c.compile(fixtureCompileInput());
    expect(inner.calls).toHaveLength(2);
    // Second call gets a priorDraft but an empty violations array.
    expect(inner.calls[1]?.priorDraft).toBeDefined();
    expect(inner.calls[1]?.violations).toEqual([]);
  });
});
