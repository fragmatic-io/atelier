// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `GeminiCompiler`.
 *
 * Approach: inject a fake `GoogleGenAI` client via `opts.client`. The fake
 * implements only the surface the compiler actually uses today —
 * `models.generateContent({ model, contents, config })`. The real SDK returns
 * a richer object; we mock just the fields the compiler reads
 * (`response.text`, `response.usageMetadata.{promptTokenCount,candidatesTokenCount}`).
 *
 * The fake's `generateContent` is a `vi.fn()` whose return value is queued
 * per call so a single test can simulate "first response invalid → second
 * response valid" without any framework gymnastics.
 */

import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import { GeminiCompiler } from '../src/gemini-compiler.js';
import { CompilerOutputError, CompilerUnavailableError } from '../src/types.js';
import { fixtureCompileInput, fixtureManifest } from './_fixtures.js';

interface FakeResponse {
  text?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

/**
 * Minimal fake of `@google/genai`'s `GoogleGenAI`. The real client exposes
 * `client.models.generateContent(...)`. We mirror that path with a `vi.fn()`
 * that, on each call, shifts a queued response (so we can sequence multiple
 * responses for retry tests) and falls back to a "default" if the queue is
 * empty.
 */
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

const validManifestJson = JSON.stringify(fixtureManifest());

describe('GeminiCompiler', () => {
  it('cold compile success: parses manifest, reports correct token cost and model, diff_mode false', async () => {
    const { client, generateContent } = makeFakeClient([
      {
        text: validManifestJson,
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 250 },
      },
    ]);
    const c = new GeminiCompiler({ apiKey: 'key', client });
    const r = await c.compile(fixtureCompileInput());

    expect(r.token_cost).toBe(350);
    expect(r.model).toBe('gemini-2.5-pro');
    expect(r.diff_mode).toBe(false);
    // Phase 1.5: manifest_id is server-generated, not LLM-authored.
    // The framework overwrites whatever the LLM emits with a fresh value
    // matching the schema regex — eliminates one class of validation retry.
    expect(r.manifest.manifest_id).toMatch(/^m_[a-z0-9]{8,}$/);
    expect(generateContent).toHaveBeenCalledTimes(1);
    const args = (generateContent.mock.calls[0] as unknown as [{ model: string }])[0];
    expect(args.model).toBe('gemini-2.5-pro');
  });

  it('diff mode: routes to diffModel and sets diff_mode true', async () => {
    const { client, generateContent } = makeFakeClient([
      {
        text: validManifestJson,
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 50 },
      },
    ]);
    const c = new GeminiCompiler({
      apiKey: 'key',
      client,
      coldModel: 'cold-x',
      diffModel: 'diff-y',
    });
    const r = await c.compile(fixtureCompileInput({ previousManifest: fixtureManifest() }));

    expect(r.diff_mode).toBe(true);
    expect(r.model).toBe('diff-y');
    const args = (generateContent.mock.calls[0] as unknown as [{ model: string }])[0];
    expect(args.model).toBe('diff-y');
  });

  it('validation failure on first response, success on retry', async () => {
    const { client, generateContent } = makeFakeClient([
      // Valid JSON but not a valid Manifest (missing required fields).
      { text: JSON.stringify({ wrong: 'shape' }) },
      {
        text: validManifestJson,
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      },
    ]);
    const c = new GeminiCompiler({ apiKey: 'key', client });
    const r = await c.compile(fixtureCompileInput());

    expect(generateContent).toHaveBeenCalledTimes(2);
    // Phase 1.5: manifest_id is server-generated, not LLM-authored.
    // The framework overwrites whatever the LLM emits with a fresh value
    // matching the schema regex — eliminates one class of validation retry.
    expect(r.manifest.manifest_id).toMatch(/^m_[a-z0-9]{8,}$/);
  });

  it('validation failure with maxRetries=0 throws CompilerOutputError', async () => {
    const { client } = makeFakeClient([{ text: '{"not":"a manifest"}' }]);
    const c = new GeminiCompiler({ apiKey: 'key', client, maxRetries: 0 });
    await expect(c.compile(fixtureCompileInput())).rejects.toBeInstanceOf(CompilerOutputError);
  });

  it('JSON parse failure on first response, success on retry', async () => {
    const { client, generateContent } = makeFakeClient([
      { text: 'not json at all' },
      {
        text: validManifestJson,
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      },
    ]);
    const c = new GeminiCompiler({ apiKey: 'key', client });
    const r = await c.compile(fixtureCompileInput());

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(r.token_cost).toBe(2);
  });

  it('throws CompilerUnavailableError when apiKey is empty', () => {
    expect(() => new GeminiCompiler({ apiKey: '' })).toThrow(CompilerUnavailableError);
  });

  it('honors AbortSignal: aborted signal causes the underlying call to reject and the compiler to bubble', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const { client } = makeFakeClient([
      // Mirror SDK behavior: rejects when the signal is already aborted.
      // Returning a rejected promise avoids the lint complaint about an
      // async arrow with no await.
      () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    ]);
    const c = new GeminiCompiler({ apiKey: 'key', client, maxRetries: 0 });
    await expect(c.compile(fixtureCompileInput({ signal: ctrl.signal }))).rejects.toThrow(
      /aborted/,
    );
  });

  it('token_cost defaults to 0 when usageMetadata is absent', async () => {
    const { client } = makeFakeClient([{ text: validManifestJson }]);
    const c = new GeminiCompiler({ apiKey: 'key', client });
    const r = await c.compile(fixtureCompileInput());
    expect(r.token_cost).toBe(0);
  });

  it('id includes both cold and diff model names', () => {
    const { client } = makeFakeClient([]);
    const c = new GeminiCompiler({
      apiKey: 'key',
      client,
      coldModel: 'cold-x',
      diffModel: 'diff-y',
    });
    expect(c.id).toContain('cold-x');
    expect(c.id).toContain('diff-y');
    expect(c.id.startsWith('gemini-compiler[')).toBe(true);
  });
});
