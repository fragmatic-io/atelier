// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Unit test for the gating predicate in `gemini-smoke.eval.ts`.
 *
 * The eval is the network witness — that runs under `cir-evals run`, not
 * vitest. This file pins only the "is the key real?" decision so we know the
 * skip path stays green on CI without a key. We do NOT call Gemini here.
 *
 * Predicate contract: the value is treated as a real key iff
 *   - it's set
 *   - trimmed length >= 20
 *   - not a known-placeholder ('test', 'placeholder', 'fake', 'dummy', ...)
 *
 * See `hasRealGeminiKey` in `./gemini-smoke.eval.ts`.
 */
import { describe, expect, it } from 'vitest';
import smokeEval, { hasRealGeminiKey, runSmoke } from './gemini-smoke.eval.js';

describe('gemini-smoke gating', () => {
  it('treats unset GEMINI_API_KEY as no key', () => {
    expect(hasRealGeminiKey({})).toBe(false);
  });

  it('treats empty string as no key', () => {
    expect(hasRealGeminiKey({ GEMINI_API_KEY: '' })).toBe(false);
  });

  it('treats placeholder values as no key', () => {
    for (const v of ['test', 'placeholder', 'fake', 'dummy', 'changeme', 'xxx']) {
      expect(hasRealGeminiKey({ GEMINI_API_KEY: v })).toBe(false);
    }
  });

  it('treats short strings (< 20 chars) as no key', () => {
    expect(hasRealGeminiKey({ GEMINI_API_KEY: 'AIzaSy12345' })).toBe(false);
  });

  it('accepts a plausible Gemini key shape', () => {
    // Synthetic — never a real key. 39 chars, AIza prefix.
    const synthetic = 'AIzaSy' + 'A'.repeat(33);
    expect(hasRealGeminiKey({ GEMINI_API_KEY: synthetic })).toBe(true);
  });
});

describe('runSmoke without key', () => {
  it('returns the skipped outcome and never touches the network', async () => {
    const original = process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    try {
      const out = await runSmoke({
        route: '/repos',
        user_id: 'u',
        app_id: 'a',
        intent_summary: 'noop',
      });
      expect(out).toEqual({ skipped: true, reason: 'no GEMINI_API_KEY' });
    } finally {
      if (original !== undefined) process.env['GEMINI_API_KEY'] = original;
    }
  });
});

describe('gemini-smoke spec metadata', () => {
  it('is registered as an end-to-end eval with the smoke tag', () => {
    expect(smokeEval.id).toBe('end-to-end/gemini-smoke');
    expect(smokeEval.kind).toBe('end-to-end');
    expect(smokeEval.tags).toContain('smoke');
  });

  it('predicate accepts the skipped outcome when env has no key', () => {
    const predicate = smokeEval.expected as (out: unknown) => boolean;
    expect(predicate({ skipped: true, reason: 'no GEMINI_API_KEY' })).toBe(true);
    expect(predicate({ skipped: true, reason: 'something else' })).toBe(false);
  });
});
