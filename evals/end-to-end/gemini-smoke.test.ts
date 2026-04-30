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
import smokeEval, {
  hasRealGeminiKey,
  isAuthShapedError,
  redactApiKey,
  runSmoke,
} from './gemini-smoke.eval.js';
import type { CompilerService, CompileResult } from '@cir/compiler';

/**
 * Synthetic API key shape for the auth-error tests. Long enough to pass
 * `hasRealGeminiKey`, obviously not a real key. Never commit a real key
 * here — the redaction test asserts this exact value gets stripped.
 */
const FAKE_KEY = 'AIzaSy-FAKE-NEVER-A-REAL-KEY-1234567890';

/**
 * Build a stub compiler whose `compile()` always rejects with the given error.
 * The non-Error error shapes used in the auth-classifier tests (e.g.
 * `{ status: 401, message: 'Unauthorized' }`) are deliberate — `@google/genai`
 * surfaces non-Error rejection values in practice. We wrap them in a thin
 * Error so the linter's `prefer-promise-reject-errors` rule is satisfied
 * while preserving the original `status` / `message` fields the classifier reads.
 */
function failingCompiler(err: unknown): CompilerService {
  return {
    id: 'stub-failing-compiler',
    compile: (): Promise<CompileResult> => {
      // Wrap non-Error rejection values into an Error that copies `status` /
      // `code` so `isAuthShapedError` still sees them. Already-Error values
      // pass through untouched.
      const rejection: Error =
        err instanceof Error
          ? err
          : Object.assign(
              new Error(
                typeof (err as { message?: unknown }).message === 'string'
                  ? String((err as { message: string }).message)
                  : String(err),
              ),
              err as object,
            );
      return Promise.reject(rejection);
    },
  };
}

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

describe('isAuthShapedError classifier', () => {
  it('treats HTTP 401 as auth-shaped', () => {
    expect(isAuthShapedError({ status: 401, message: 'Unauthorized' })).toBe(true);
  });

  it('treats HTTP 403 as auth-shaped', () => {
    expect(isAuthShapedError({ status: 403, message: 'Forbidden' })).toBe(true);
  });

  it('treats "API key not valid" as auth-shaped', () => {
    expect(isAuthShapedError(new Error('API key not valid. Please pass a valid API key.'))).toBe(
      true,
    );
  });

  it('treats timeouts as NOT auth-shaped', () => {
    expect(isAuthShapedError(new Error('compiler.compile timed out after 90000ms'))).toBe(false);
  });

  it('treats schema validation as NOT auth-shaped', () => {
    expect(isAuthShapedError(new Error('Manifest validation failed: routes is required'))).toBe(
      false,
    );
  });

  it('treats null / undefined / strings as NOT auth-shaped', () => {
    expect(isAuthShapedError(null)).toBe(false);
    expect(isAuthShapedError(undefined)).toBe(false);
    expect(isAuthShapedError('Unauthorized')).toBe(false);
  });
});

describe('redactApiKey', () => {
  it('replaces the literal API key with [REDACTED]', () => {
    const msg = `API key ${FAKE_KEY} is invalid`;
    expect(redactApiKey(msg, FAKE_KEY)).toBe('API key [REDACTED] is invalid');
    expect(redactApiKey(msg, FAKE_KEY)).not.toContain(FAKE_KEY);
  });

  it('is a no-op when the key is missing or implausibly short', () => {
    expect(redactApiKey('hello', undefined)).toBe('hello');
    expect(redactApiKey('hello', '')).toBe('hello');
    expect(redactApiKey('hello', 'abc')).toBe('hello');
  });

  it('redacts every occurrence', () => {
    const msg = `${FAKE_KEY} ... again ${FAKE_KEY}`;
    const out = redactApiKey(msg, FAKE_KEY);
    expect(out).toBe('[REDACTED] ... again [REDACTED]');
    expect(out.includes(FAKE_KEY)).toBe(false);
  });
});

describe('runSmoke auth_failed branch', () => {
  const input = {
    route: '/repos',
    user_id: 'u',
    app_id: 'a',
    intent_summary: 'noop',
  };

  it('classifies a 401 from compile() as auth_failed: true', async () => {
    const out = await runSmoke(input, {
      envKeyResolver: () => FAKE_KEY,
      compilerFactory: () => failingCompiler({ status: 401, message: 'Unauthorized' }),
    });
    expect(out.skipped).toBe(false);
    expect(out.auth_failed).toBe(true);
    expect(out.error_message).toBe('Unauthorized');
  });

  it('redacts the API key from the error message before surfacing it', async () => {
    const leaky = new Error(`API_KEY_INVALID for key ${FAKE_KEY} (project 12345)`);
    const out = await runSmoke(input, {
      envKeyResolver: () => FAKE_KEY,
      compilerFactory: () => failingCompiler(leaky),
    });
    expect(out.auth_failed).toBe(true);
    expect(out.error_message).toBeDefined();
    // The redaction is the load-bearing assertion: the key must not leak.
    expect(out.error_message).toContain('[REDACTED]');
    expect(out.error_message).not.toContain(FAKE_KEY);
  });

  it('does NOT classify a timeout as auth_failed; lets it bubble', async () => {
    const timeout = new Error('compiler.compile timed out after 90000ms');
    await expect(
      runSmoke(input, {
        envKeyResolver: () => FAKE_KEY,
        compilerFactory: () => failingCompiler(timeout),
      }),
    ).rejects.toThrow(/timed out/);
  });

  it('returns auth_failed: null on the happy path (regression)', () => {
    // We don't actually exercise the happy path here because it hits the
    // network — but we can prove the field is initialized to `null` (not
    // undefined or absent) by inspecting the eval's `expected` predicate
    // contract. The happy-path field shape lives in the eval source and is
    // covered by the runtime smoke; this test pins that `auth_failed: null`
    // is accepted by the predicate (i.e., not mistaken for `auth_failed: true`).
    const predicate = smokeEval.expected as (out: unknown) => boolean;
    expect(
      predicate({
        skipped: false,
        auth_failed: null,
        manifest_id: 'm_test',
        compiler_model: 'gemini-2.5-pro',
        compiler_model_is_gemini: true,
        policy_pass: true,
        route_count: 1,
        walked_node_count: 1,
      }),
    ).toBe(true);
    // And the auth_failed: true branch must NOT pass the predicate.
    expect(
      predicate({
        skipped: false,
        auth_failed: true,
        error_message: 'Unauthorized',
      }),
    ).toBe(false);
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
