// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `GeminiIntentProfileCompiler` and `CompositeIntentProfileCompiler`.
 *
 * Approach mirrors `gemini-compiler.test.ts`: inject a fake `GoogleGenAI`
 * client whose `generateContent` shifts a queued response per call, so we
 * can sequence retry behavior without any framework gymnastics. The fake
 * implements only the surface the compiler reads — `response.text` and
 * `response.usageMetadata`.
 *
 * Fallback heuristics get their own dedicated file; here we just sanity-check
 * the composite cascade path uses the fallback when Gemini throws.
 */

import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import type { Capability, IntentProfile } from '@atelier/schemas';
import {
  CompositeIntentProfileCompiler,
  FallbackIntentProfileCompiler,
  GeminiIntentProfileCompiler,
  type CompileIntentProfileInput,
} from '../src/intent-profile-compiler.js';
import { CompilerOutputError, CompilerUnavailableError } from '../src/types.js';

interface FakeResponse {
  text?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

function makeFakeClient(responses: Array<FakeResponse | (() => Promise<FakeResponse>)>) {
  const queue = [...responses];
  const generateContent = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('fake client: no queued response');
    if (typeof next === 'function') return next();
    return next;
  });
  return {
    generateContent,
    client: {
      models: { generateContent },
    } as unknown as GoogleGenAI,
  };
}

function fixtureProfile(overrides: Partial<IntentProfile> = {}): IntentProfile {
  return {
    user_id: 'demo-user',
    profile_version: 1,
    updated_at: '2026-04-30T00:00:00Z',
    global_preferences: { density: 'compact' },
    lenses: { github: 'reviewer' },
    rules: [{ scope: '*', rule: 'Surface morning items first.', version: 1 }],
    vocabulary: {},
    cross_app_workflows: [],
    ...overrides,
  };
}

const validProfileJson = JSON.stringify(fixtureProfile());

function fixtureInput(
  overrides: Partial<CompileIntentProfileInput> = {},
): CompileIntentProfileInput {
  return {
    description: 'I review GitHub PRs in the morning.',
    user_id: 'demo-user',
    capabilities: [] as ReadonlyArray<Capability>,
    ...overrides,
  };
}

describe('GeminiIntentProfileCompiler', () => {
  it('happy path: parses profile, returns model id and token cost', async () => {
    const { client, generateContent } = makeFakeClient([
      {
        text: validProfileJson,
        usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 120 },
      },
    ]);
    const c = new GeminiIntentProfileCompiler({ apiKey: 'k', client });
    const r = await c.compileIntentProfile(fixtureInput());

    expect(r.token_cost).toBe(200);
    expect(r.compiler_model).toBe('gemini-2.5-flash');
    expect(r.profile.user_id).toBe('demo-user');
    expect(r.profile.lenses['github']).toBe('reviewer');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('validation failure on first response, success on retry', async () => {
    const { client, generateContent } = makeFakeClient([
      { text: JSON.stringify({ wrong: 'shape' }) },
      {
        text: validProfileJson,
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      },
    ]);
    const c = new GeminiIntentProfileCompiler({ apiKey: 'k', client });
    const r = await c.compileIntentProfile(fixtureInput());

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(r.profile.user_id).toBe('demo-user');
    expect(r.token_cost).toBe(15);
  });

  it('max-retries exhausted throws CompilerOutputError', async () => {
    const { client } = makeFakeClient([{ text: '{"bogus":"shape"}' }]);
    const c = new GeminiIntentProfileCompiler({ apiKey: 'k', client, maxRetries: 0 });
    await expect(c.compileIntentProfile(fixtureInput())).rejects.toBeInstanceOf(
      CompilerOutputError,
    );
  });

  it('JSON parse failure on first response, success on retry', async () => {
    const { client, generateContent } = makeFakeClient([
      { text: 'not json' },
      { text: validProfileJson, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } },
    ]);
    const c = new GeminiIntentProfileCompiler({ apiKey: 'k', client });
    const r = await c.compileIntentProfile(fixtureInput());
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(r.token_cost).toBe(2);
  });

  it('throws CompilerUnavailableError when apiKey is empty', () => {
    expect(() => new GeminiIntentProfileCompiler({ apiKey: '' })).toThrow(CompilerUnavailableError);
  });

  it('honors AbortSignal: aborted signal causes the underlying call to reject and bubbles', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const { client } = makeFakeClient([
      () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    ]);
    const c = new GeminiIntentProfileCompiler({ apiKey: 'k', client, maxRetries: 0 });
    await expect(c.compileIntentProfile(fixtureInput(), { signal: ctrl.signal })).rejects.toThrow(
      /aborted/,
    );
  });

  it('id includes model name and prompt-version marker', () => {
    const { client } = makeFakeClient([]);
    const c = new GeminiIntentProfileCompiler({
      apiKey: 'k',
      client,
      model: 'gemini-x',
    });
    expect(c.id).toContain('gemini-x');
    expect(c.id).toContain('sys@');
  });

  it('token_cost defaults to 0 when usageMetadata absent', async () => {
    const { client } = makeFakeClient([{ text: validProfileJson }]);
    const c = new GeminiIntentProfileCompiler({ apiKey: 'k', client });
    const r = await c.compileIntentProfile(fixtureInput());
    expect(r.token_cost).toBe(0);
  });
});

describe('CompositeIntentProfileCompiler', () => {
  it('throws when constructed with an empty list', () => {
    expect(() => new CompositeIntentProfileCompiler([])).toThrow(/at least one service/);
  });

  it('returns the primary result without invoking the fallback on success', async () => {
    const fallback = new FallbackIntentProfileCompiler();
    const fallbackSpy = vi.spyOn(fallback, 'compileIntentProfile');
    const { client } = makeFakeClient([
      { text: validProfileJson, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } },
    ]);
    const primary = new GeminiIntentProfileCompiler({ apiKey: 'k', client });
    const composite = new CompositeIntentProfileCompiler([primary, fallback]);
    const r = await composite.compileIntentProfile(fixtureInput());

    expect(r.compiler_model).toBe('gemini-2.5-flash');
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it('falls back to the next service when the primary throws and fires onCascade', async () => {
    const onCascade = vi.fn();
    const failing = {
      id: 'failing',
      compileIntentProfile: () => Promise.reject(new Error('boom')),
    };
    const fallback = new FallbackIntentProfileCompiler();
    const composite = new CompositeIntentProfileCompiler([failing, fallback], { onCascade });
    const r = await composite.compileIntentProfile(
      fixtureInput({ description: 'I love github code review' }),
    );

    expect(onCascade).toHaveBeenCalledTimes(1);
    expect(onCascade.mock.calls[0]?.[0]).toBe('failing');
    expect(r.compiler_model).toBe('fallback-intent-profile');
    expect(r.profile.lenses['github']).toBe('reviewer');
  });

  it('throws CompilerOutputError citing chain length when all services fail', async () => {
    const a = { id: 'a', compileIntentProfile: () => Promise.reject(new Error('a-bad')) };
    const b = { id: 'b', compileIntentProfile: () => Promise.reject(new Error('b-bad')) };
    const composite = new CompositeIntentProfileCompiler([a, b]);
    await expect(composite.compileIntentProfile(fixtureInput())).rejects.toBeInstanceOf(
      CompilerOutputError,
    );
  });

  it('id is formatted with all service ids', () => {
    const a = { id: 'svc-a', compileIntentProfile: () => Promise.reject(new Error('x')) };
    const b = { id: 'svc-b', compileIntentProfile: () => Promise.reject(new Error('x')) };
    const composite = new CompositeIntentProfileCompiler([a, b]);
    expect(composite.id).toBe('composite-intent-profile[svc-a,svc-b]');
  });
});
