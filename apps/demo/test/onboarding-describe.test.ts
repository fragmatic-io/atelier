// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `lib/onboarding-compile.ts` — the pure helper behind the
 * `/api/cir/onboarding/compile` route. Exercises the validator + handler
 * with a stub compiler so we don't touch the network or Next.js
 * server machinery.
 *
 * The route file itself is a thin adapter on top of these helpers;
 * separate Playwright e2e covers the wire-up.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Capability } from '@cir/schemas';
import type {
  CompileIntentProfileInput,
  CompileIntentProfileResult,
  IntentProfileCompilerService,
} from '@cir/compiler';
import {
  buildIntentProfileCompiler,
  handleCompileRequest,
  validateCompileBody,
} from '../lib/onboarding-compile';

function fakeProfile(overrides = {}): CompileIntentProfileResult {
  return {
    profile: {
      user_id: 'demo-user',
      profile_version: 1,
      updated_at: '2026-04-30T00:00:00Z',
      global_preferences: { density: 'compact' },
      lenses: { github: 'reviewer' },
      rules: [],
      vocabulary: {},
      cross_app_workflows: [],
    },
    compiler_model: 'stub-model',
    token_cost: 0,
    prompt_size: 12,
    ...overrides,
  };
}

function stubCompiler(
  behavior: (input: CompileIntentProfileInput) => Promise<CompileIntentProfileResult>,
): IntentProfileCompilerService {
  return { id: 'stub', compileIntentProfile: behavior };
}

const NO_CAPS: ReadonlyArray<Capability> = [];

describe('validateCompileBody', () => {
  it('rejects non-object bodies', () => {
    expect(validateCompileBody(null).ok).toBe(false);
    expect(validateCompileBody('hi').ok).toBe(false);
    expect(validateCompileBody(123).ok).toBe(false);
  });

  it('requires description to be a string', () => {
    const r = validateCompileBody({ description: 42, user_id: 'u' });
    expect(r.ok).toBe(false);
  });

  it('requires user_id to be a non-empty string', () => {
    const r = validateCompileBody({ description: 'hi', user_id: '' });
    expect(r.ok).toBe(false);
  });

  it('caps description length at 4000 chars', () => {
    const long = 'x'.repeat(4001);
    const r = validateCompileBody({ description: long, user_id: 'u' });
    expect(r.ok).toBe(false);
  });

  it('accepts valid input', () => {
    const r = validateCompileBody({ description: 'hi there', user_id: 'demo-user' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body.description).toBe('hi there');
      expect(r.body.user_id).toBe('demo-user');
    }
  });
});

describe('handleCompileRequest', () => {
  it('happy path: returns 200 with profile + compiler_model', async () => {
    const compile = vi.fn(async () => fakeProfile());
    const result = await handleCompileRequest(
      { description: 'I review GitHub PRs', user_id: 'demo-user' },
      { compiler: stubCompiler(compile), capabilities: NO_CAPS },
    );
    expect(result.status).toBe(200);
    if ('profile' in result.body) {
      expect(result.body.profile.user_id).toBe('demo-user');
      expect(result.body.compiler_model).toBe('stub-model');
    }
    expect(compile).toHaveBeenCalledTimes(1);
  });

  it('compiler throw → 500 with error message', async () => {
    const compile = vi.fn(() => Promise.reject(new Error('boom')));
    const result = await handleCompileRequest(
      { description: 'desc', user_id: 'demo-user' },
      { compiler: stubCompiler(compile), capabilities: NO_CAPS },
    );
    expect(result.status).toBe(500);
    if ('error' in result.body) {
      expect(result.body.error).toBe('boom');
    }
  });

  it('schema-invalid input → 400', async () => {
    const compile = vi.fn(async () => fakeProfile());
    const result = await handleCompileRequest(
      { description: 42, user_id: 'demo-user' },
      { compiler: stubCompiler(compile), capabilities: NO_CAPS },
    );
    expect(result.status).toBe(400);
    expect(compile).not.toHaveBeenCalled();
  });

  it('missing user_id → 400', async () => {
    const compile = vi.fn(async () => fakeProfile());
    const result = await handleCompileRequest(
      { description: 'desc' },
      { compiler: stubCompiler(compile), capabilities: NO_CAPS },
    );
    expect(result.status).toBe(400);
    if ('error' in result.body) {
      expect(result.body.error).toMatch(/user_id/);
    }
    expect(compile).not.toHaveBeenCalled();
  });

  it('forwards description into the compiler input verbatim', async () => {
    const seen: CompileIntentProfileInput[] = [];
    const compile = vi.fn(async (input: CompileIntentProfileInput) => {
      seen.push(input);
      return fakeProfile();
    });
    await handleCompileRequest(
      { description: 'shop and review GitHub', user_id: 'demo-user' },
      { compiler: stubCompiler(compile), capabilities: NO_CAPS },
    );
    expect(seen[0]?.description).toBe('shop and review GitHub');
  });
});

describe('buildIntentProfileCompiler', () => {
  it('returns a composite that includes the fallback even without a key', () => {
    const original = process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    try {
      const c = buildIntentProfileCompiler();
      expect(c.id).toContain('fallback-intent-profile');
    } finally {
      if (original !== undefined) process.env['GEMINI_API_KEY'] = original;
    }
  });
});
