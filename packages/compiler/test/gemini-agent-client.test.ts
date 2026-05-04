// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `GeminiAgentClient` — the function-calling-aware sibling of
 * `GeminiCompiler`. We mock the underlying `@google/genai` client and
 * exercise:
 *   - cold vs diff model routing (temperature signal)
 *   - tool-call response shape
 *   - text response shape
 *   - content translation (user / model-text / model-toolCalls / tool-response)
 *   - `apiKey` guard (throws CompilerUnavailableError)
 *   - token-cost arithmetic with absent usageMetadata
 */

import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import { GeminiAgentClient } from '../src/gemini-agent-client.js';
import { CompilerUnavailableError } from '../src/types.js';
import type {
  AgentContent,
  AgentToolDeclaration,
  AgentTurnRequest,
} from '../src/tool-using-compiler.js';

interface FakeGenResponse {
  text?: string;
  functionCalls?: ReadonlyArray<{ id?: string; name?: string; args?: Record<string, unknown> }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

function makeFakeClient(responses: FakeGenResponse[]) {
  const queue = [...responses];
  const generateContent = vi.fn((): Promise<FakeGenResponse> => {
    const next = queue.shift();
    if (!next) return Promise.reject(new Error('no queued response'));
    return Promise.resolve(next);
  });
  return {
    generateContent,
    client: {
      models: { generateContent },
    } as unknown as GoogleGenAI,
  };
}

const tool: AgentToolDeclaration = {
  name: 'find_capability',
  description: 'Look up a capability by id',
  parameters: { type: 'object', properties: { id: { type: 'string' } } },
};

function baseRequest(overrides: Partial<AgentTurnRequest> = {}): AgentTurnRequest {
  return {
    contents: [{ role: 'user', text: 'compile something' }],
    tools: [tool],
    systemInstruction: 'sys',
    temperature: 0.2,
    ...overrides,
  };
}

describe('GeminiAgentClient', () => {
  it('throws CompilerUnavailableError when constructed without an apiKey', () => {
    expect(() => new GeminiAgentClient({ apiKey: '' })).toThrow(CompilerUnavailableError);
  });

  it('id includes both cold and diff models', () => {
    const { client } = makeFakeClient([]);
    const c = new GeminiAgentClient({
      apiKey: 'k',
      client,
      coldModel: 'cold-x',
      diffModel: 'diff-y',
    });
    expect(c.id).toBe('gemini-agent[cold-x,diff-y]');
  });

  it('routes temperature=0 to the diff model and reports it in the response', async () => {
    const { client, generateContent } = makeFakeClient([
      { text: 'hi', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } },
    ]);
    const c = new GeminiAgentClient({ apiKey: 'k', client });
    const r = await c.generateTurn(baseRequest({ temperature: 0 }));
    expect(r.model).toBe('gemini-2.5-flash');
    expect(r.text).toBe('hi');
    expect(r.tokenCost).toBe(15);
    const args = (generateContent.mock.calls[0] as unknown as [{ model: string }])[0];
    expect(args.model).toBe('gemini-2.5-flash');
  });

  it('routes non-zero temperature to the cold model', async () => {
    const { client, generateContent } = makeFakeClient([{ text: 'ok' }]);
    const c = new GeminiAgentClient({ apiKey: 'k', client });
    await c.generateTurn(baseRequest({ temperature: 0.2 }));
    const args = (generateContent.mock.calls[0] as unknown as [{ model: string }])[0];
    expect(args.model).toBe('gemini-2.5-pro');
  });

  it('returns toolCalls when the response carries function calls', async () => {
    const { client } = makeFakeClient([
      {
        functionCalls: [
          { id: 'call_1', name: 'find_capability', args: { id: 'thread.read' } },
          { name: 'find_capability', args: {} },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      },
    ]);
    const c = new GeminiAgentClient({ apiKey: 'k', client });
    const r = await c.generateTurn(baseRequest());
    expect(r.toolCalls).toBeDefined();
    expect(r.toolCalls).toHaveLength(2);
    expect(r.toolCalls?.[0]).toEqual({
      id: 'call_1',
      name: 'find_capability',
      args: { id: 'thread.read' },
    });
    // Second call: name preserved, no `id` because the response had none.
    expect(r.toolCalls?.[1]?.name).toBe('find_capability');
    expect(r.toolCalls?.[1]?.id).toBeUndefined();
    expect(r.text).toBeUndefined();
  });

  it('falls back to placeholders when functionCall has missing fields', async () => {
    const { client } = makeFakeClient([
      {
        functionCalls: [{}],
      },
    ]);
    const c = new GeminiAgentClient({ apiKey: 'k', client });
    const r = await c.generateTurn(baseRequest());
    expect(r.toolCalls?.[0]?.name).toBe('<unnamed>');
    expect(r.toolCalls?.[0]?.args).toEqual({});
  });

  it('returns text when no function calls are present', async () => {
    const { client } = makeFakeClient([{ text: 'final answer', usageMetadata: {} }]);
    const c = new GeminiAgentClient({ apiKey: 'k', client });
    const r = await c.generateTurn(baseRequest());
    expect(r.text).toBe('final answer');
    expect(r.toolCalls).toBeUndefined();
  });

  it('text defaults to empty string when missing', async () => {
    const { client } = makeFakeClient([{}]);
    const c = new GeminiAgentClient({ apiKey: 'k', client });
    const r = await c.generateTurn(baseRequest());
    expect(r.text).toBe('');
  });

  it('translates AgentContent variants to Gemini parts', async () => {
    const { client, generateContent } = makeFakeClient([{ text: 'ok' }]);
    const c = new GeminiAgentClient({ apiKey: 'k', client });
    const contents: readonly AgentContent[] = [
      { role: 'user', text: 'hi' },
      { role: 'model', text: 'hello' },
      {
        role: 'model',
        toolCalls: [{ name: 'find_capability', args: { q: 'thread.read' } }],
      },
      { role: 'tool', name: 'find_capability', response: { hits: [] } },
    ];
    await c.generateTurn(baseRequest({ contents }));
    const args = (
      generateContent.mock.calls[0] as unknown as [
        { contents: Array<{ role: string; parts: unknown[] }> },
      ]
    )[0];
    expect(args.contents).toHaveLength(4);
    expect(args.contents[0]).toEqual({ role: 'user', parts: [{ text: 'hi' }] });
    expect(args.contents[1]).toEqual({ role: 'model', parts: [{ text: 'hello' }] });
    expect(args.contents[2]?.role).toBe('model');
    expect(args.contents[2]?.parts[0]).toMatchObject({
      functionCall: { name: 'find_capability' },
    });
    expect(args.contents[3]?.role).toBe('user');
    expect(args.contents[3]?.parts[0]).toMatchObject({
      functionResponse: { name: 'find_capability' },
    });
  });

  it('forwards an abort signal to the underlying client', async () => {
    const { client, generateContent } = makeFakeClient([{ text: 'ok' }]);
    const c = new GeminiAgentClient({ apiKey: 'k', client });
    const ctrl = new AbortController();
    await c.generateTurn(baseRequest({ signal: ctrl.signal }));
    const args = (
      generateContent.mock.calls[0] as unknown as [{ config: { abortSignal?: AbortSignal } }]
    )[0];
    expect(args.config.abortSignal).toBe(ctrl.signal);
  });

  it('tokenCost defaults to 0 when usageMetadata is absent', async () => {
    const { client } = makeFakeClient([{ text: 'ok' }]);
    const c = new GeminiAgentClient({ apiKey: 'k', client });
    const r = await c.generateTurn(baseRequest());
    expect(r.tokenCost).toBe(0);
  });
});
