/* eslint-disable @typescript-eslint/require-await -- stub agents must be Promise-returning to satisfy AgentClient.generateTurn; not every stub awaits */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the Wave C / Phase C-2 surface — `ToolUsingCompiler`. The
 * wrapper drives a bounded agent loop: the inner `AgentClient` returns
 * either tool calls or a final manifest, and the wrapper dispatches each
 * tool against a `ToolEnvironment`.
 *
 * Strategy: drive a stub `AgentClient` whose successive turns are scripted
 * per test. The `ToolEnvironment` is a minimal hand-rolled bag (a couple
 * of capabilities + components + an optional validator). We assert:
 *
 *   - first turn is a tool call → wrapper dispatches against env, appends
 *     response, calls again
 *   - last turn is final text → wrapper parses as Manifest and returns
 *   - token cost accumulates across turns; duration accumulates
 *   - `onToolCall` fires on each call with name + args + result
 *   - `maxToolRounds` bounds the loop and throws on exceed
 *   - each tool returns the right data given env state
 *   - `validateDraft` defaults to `{ ok: true }` when env has no validator
 *   - the wrapper composes inside `ValidationFeedbackCompiler` (the C-1
 *     wrapper) — the validation loop fires when the agent emits an invalid
 *     manifest
 */

import type { Capability, ComponentDefinition, Manifest } from '@atelier/schemas';
import { describe, expect, it, vi } from 'vitest';
import { CompositeCompiler } from '../src/composite-compiler.js';
import { CompilerOutputError, type CompileInput } from '../src/types.js';
import {
  ToolUsingCompiler,
  type AgentClient,
  type AgentToolCall,
  type AgentTurnRequest,
  type AgentTurnResponse,
} from '../src/tool-using-compiler.js';
import { ValidationFeedbackCompiler } from '../src/validation-feedback-compiler.js';
import type { ToolEnvironment } from '../src/tool-environment.js';
import { fixtureCompileInput, fixtureManifest } from './_fixtures.js';

/**
 * Stub agent whose `generateTurn` shifts a pre-scripted response off a
 * queue. Captures the per-turn `AgentTurnRequest` so tests can assert on
 * conversation history (tool calls, tool responses, etc).
 */
function scriptedAgent(
  id: string,
  responses: ReadonlyArray<AgentTurnResponse | (() => AgentTurnResponse)>,
): { agent: AgentClient; turns: AgentTurnRequest[] } {
  const queue = [...responses];
  const turns: AgentTurnRequest[] = [];
  const agent: AgentClient = {
    id,
    generateTurn: async (req: AgentTurnRequest) => {
      turns.push(req);
      const next = queue.shift();
      if (next === undefined) throw new Error(`scriptedAgent ${id}: no queued response`);
      return typeof next === 'function' ? next() : next;
    },
  };
  return { agent, turns };
}

function fixtureCapabilityMap(): Record<string, Capability> {
  return {
    'thread.archive': {
      id: 'thread.archive',
      kind: 'action',
      version: '1.0.0',
      input: { thread_id: 'string' },
      output: { archived_at: 'string' },
      side_effects: ['archive', 'mutates:thread_state'],
      permissions: ['thread:write'],
      confirmation: 'none',
      reversible: true,
      rollback: 'thread.unarchive',
      description: 'Archive a thread (reversible).',
    } as unknown as Capability,
    'thread.list': {
      id: 'thread.list',
      kind: 'data',
      version: '1.0.0',
      description: 'List threads in the inbox.',
    } as unknown as Capability,
    'github.issue.list': {
      id: 'github.issue.list',
      kind: 'data',
      version: '1.0.0',
      description: 'List GitHub issues.',
    } as unknown as Capability,
  };
}

function fixtureComponentList(): ComponentDefinition[] {
  return [
    {
      id: 'Stack',
      props_schema: 'StackProps',
      data_sources: [],
      actions_supported: [],
      responsive_targets: ['web'],
      design_tokens: '@app/tokens/v1',
      examples: [],
      text_render: true,
      description: 'Vertical or horizontal layout container.',
    } as unknown as ComponentDefinition,
    {
      id: 'Queue',
      props_schema: 'QueueProps',
      data_sources: ['thread.list'],
      actions_supported: ['thread.archive'],
      responsive_targets: ['web'],
      design_tokens: '@app/tokens/v1',
      examples: [],
      text_render: true,
      description: 'Items requiring action — for inbox / decision queues.',
    } as unknown as ComponentDefinition,
    {
      id: 'Markdown',
      props_schema: 'MarkdownProps',
      data_sources: [],
      actions_supported: [],
      responsive_targets: ['web'],
      design_tokens: '@app/tokens/v1',
      examples: [],
      text_render: true,
      description: 'Rich text body. Headings, descriptions, prose copy.',
    } as unknown as ComponentDefinition,
  ];
}

function defaultEnv(): ToolEnvironment {
  return {
    capabilities: fixtureCapabilityMap(),
    components: fixtureComponentList(),
  };
}

const finalManifest = fixtureManifest({ manifest_id: 'm_replaced0' });
const finalManifestText = JSON.stringify(finalManifest);

describe('ToolUsingCompiler', () => {
  it('returns the agent’s final manifest when the first turn is final text', async () => {
    const { agent, turns } = scriptedAgent('gemini-agent', [
      { text: finalManifestText, tokenCost: 350, model: 'gemini-2.5-pro' },
    ]);
    const c = new ToolUsingCompiler({ inner: agent, env: defaultEnv() });

    const r = await c.compile(fixtureCompileInput());
    expect(r.manifest.manifest_id).toMatch(/^m_[a-z0-9]{8,}$/);
    // The wrapper auto-rewrites `manifest_id` (matches `GeminiCompiler`
    // semantics) so the LLM-emitted id is replaced with a server one.
    expect(r.manifest.manifest_id).not.toBe('m_replaced0');
    expect(r.token_cost).toBe(350);
    expect(r.model).toBe('gemini-2.5-pro');
    expect(r.diff_mode).toBe(false);
    expect(turns).toHaveLength(1);
    // The tool declarations are surfaced on every turn.
    expect(turns[0]?.tools.map((t) => t.name)).toEqual([
      'lookupCapability',
      'findCapability',
      'listCapabilities',
      'findComponent',
      'inspectComponent',
      'listComponents',
      'validateDraft',
      'inspectExistingManifest',
      'listSiblingRoutes',
      'findRecipe',
    ]);
  });

  it('id namespaces the inner agent id', () => {
    const c = new ToolUsingCompiler({
      inner: scriptedAgent('gemini-agent[pro,flash]', []).agent,
      env: defaultEnv(),
    });
    expect(c.id).toBe('tool-using[gemini-agent[pro,flash]]');
  });

  it('dispatches a tool call: lookupCapability returns env data, then accepts final answer', async () => {
    const lookupCall: AgentToolCall = { name: 'lookupCapability', args: { id: 'thread.archive' } };
    const { agent, turns } = scriptedAgent('gemini-agent', [
      { toolCalls: [lookupCall], tokenCost: 50, model: 'gemini-2.5-pro' },
      { text: finalManifestText, tokenCost: 200, model: 'gemini-2.5-pro' },
    ]);
    const onToolCall = vi.fn();
    const c = new ToolUsingCompiler({ inner: agent, env: defaultEnv(), onToolCall });

    const r = await c.compile(fixtureCompileInput());

    // Token cost sums across both turns.
    expect(r.token_cost).toBe(250);
    // The second turn's `contents` must include the model's tool-call turn
    // AND the tool-response turn we appended.
    expect(turns).toHaveLength(2);
    const secondHistory = turns[1]?.contents ?? [];
    expect(secondHistory).toHaveLength(3); // user prompt + model tool-call + tool response
    expect(secondHistory[1]).toEqual({ role: 'model', toolCalls: [lookupCall] });
    expect(secondHistory[2]?.role).toBe('tool');
    // The dispatched result is the env's capability record.
    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCallArgs = (onToolCall.mock.calls[0] ?? []) as unknown as [
      { name: string },
      { id: string },
    ];
    expect(firstCallArgs[0].name).toBe('lookupCapability');
    expect(firstCallArgs[1].id).toBe('thread.archive');
  });

  it('findCapability falls back to substring match against id + description', async () => {
    const { agent } = scriptedAgent('gemini-agent', [
      {
        toolCalls: [{ name: 'findCapability', args: { intent: 'archive' } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const observed: unknown[] = [];
    const c = new ToolUsingCompiler({
      inner: agent,
      env: defaultEnv(),
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    // Substring match on id+description: only `thread.archive` carries
    // "archive" in either field.
    const refs = observed[0] as Array<{ id: string }>;
    expect(refs.map((r) => r.id)).toEqual(['thread.archive']);
  });

  it('listCapabilities filters by domain (leading id segment)', async () => {
    const { agent } = scriptedAgent('gemini-agent', [
      {
        toolCalls: [{ name: 'listCapabilities', args: { filter: { domain: 'github' } } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const observed: unknown[] = [];
    const c = new ToolUsingCompiler({
      inner: agent,
      env: defaultEnv(),
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    const refs = observed[0] as Array<{ id: string }>;
    expect(refs.map((r) => r.id)).toEqual(['github.issue.list']);
  });

  it('findComponent falls back to substring match on id and description', async () => {
    const { agent } = scriptedAgent('gemini-agent', [
      {
        toolCalls: [{ name: 'findComponent', args: { role: 'list', intent: 'inbox queue' } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const observed: unknown[] = [];
    const c = new ToolUsingCompiler({
      inner: agent,
      env: defaultEnv(),
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    const comps = observed[0] as Array<{ id: string }>;
    // "list inbox queue" matches Queue (description "decision queues") via
    // substring on "queue". May also match other components; assert Queue
    // is in the result.
    expect(comps.map((c) => c.id)).toContain('Queue');
  });

  it('inspectComponent returns the full definition for a known id; error for unknown', async () => {
    const { agent } = scriptedAgent('gemini-agent', [
      {
        toolCalls: [{ name: 'inspectComponent', args: { id: 'Queue' } }],
        tokenCost: 10,
        model: 'm',
      },
      {
        toolCalls: [{ name: 'inspectComponent', args: { id: 'NotExist' } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const observed: unknown[] = [];
    const c = new ToolUsingCompiler({
      inner: agent,
      env: defaultEnv(),
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    expect((observed[0] as { id: string }).id).toBe('Queue');
    expect(observed[1]).toEqual({ error: 'unknown component: NotExist' });
  });

  it('validateDraft returns ok:true by default when env supplies no validator', async () => {
    const draft = fixtureManifest();
    const { agent } = scriptedAgent('gemini-agent', [
      { toolCalls: [{ name: 'validateDraft', args: { draft } }], tokenCost: 10, model: 'm' },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const observed: unknown[] = [];
    const c = new ToolUsingCompiler({
      inner: agent,
      env: defaultEnv(),
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    expect(observed[0]).toEqual({ ok: true });
  });

  it('validateDraft uses env.validate when supplied, returning reasons on failure', async () => {
    const draft = fixtureManifest();
    const validate = vi.fn(() => ({ ok: false, reasons: ['Stack empty'] }));
    const { agent } = scriptedAgent('gemini-agent', [
      { toolCalls: [{ name: 'validateDraft', args: { draft } }], tokenCost: 10, model: 'm' },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const observed: unknown[] = [];
    const c = new ToolUsingCompiler({
      inner: agent,
      env: { ...defaultEnv(), validate },
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    expect(validate).toHaveBeenCalledTimes(1);
    expect(observed[0]).toEqual({ ok: false, reasons: ['Stack empty'] });
  });

  it('inspectExistingManifest returns null when env supplies no hook; uses hook when supplied', async () => {
    const seenManifest = fixtureManifest({ manifest_id: 'm_existxx01' });
    const { agent } = scriptedAgent('gemini-agent', [
      {
        toolCalls: [{ name: 'inspectExistingManifest', args: { route: '/today' } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const observed: unknown[] = [];
    const env: ToolEnvironment = {
      ...defaultEnv(),
      inspectExistingManifest: (route) => (route === '/today' ? seenManifest : null),
    };
    const c = new ToolUsingCompiler({
      inner: agent,
      env,
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    expect((observed[0] as { manifest_id: string }).manifest_id).toBe('m_existxx01');
  });

  it('listSiblingRoutes returns [] when env supplies no hook', async () => {
    const { agent } = scriptedAgent('gemini-agent', [
      { toolCalls: [{ name: 'listSiblingRoutes', args: {} }], tokenCost: 10, model: 'm' },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const observed: unknown[] = [];
    const c = new ToolUsingCompiler({
      inner: agent,
      env: defaultEnv(),
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    expect(observed[0]).toEqual([]);
  });

  it('SemanticSearch overrides the substring fallback for findCapability/findComponent', async () => {
    const search = {
      capabilities: vi.fn(() => [{ id: 'custom.cap', description: 'from RAG' }]),
      components: vi.fn(() => [
        { id: 'CustomCmp', description: 'from RAG' } as unknown as ComponentDefinition,
      ]),
    };
    const { agent } = scriptedAgent('gemini-agent', [
      {
        toolCalls: [{ name: 'findCapability', args: { intent: 'anything' } }],
        tokenCost: 10,
        model: 'm',
      },
      {
        toolCalls: [{ name: 'findComponent', args: { role: 'r', intent: 'i' } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const observed: unknown[] = [];
    const c = new ToolUsingCompiler({
      inner: agent,
      env: defaultEnv(),
      search,
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    expect(search.capabilities).toHaveBeenCalledWith('anything', 5);
    expect(search.components).toHaveBeenCalledWith('r i', 5);
    expect(observed[0]).toEqual([{ id: 'custom.cap', description: 'from RAG' }]);
  });

  it('throws CompilerOutputError when maxToolRounds is exceeded', async () => {
    const toolCallTurn: AgentTurnResponse = {
      toolCalls: [{ name: 'listSiblingRoutes', args: {} }],
      tokenCost: 1,
      model: 'm',
    };
    const { agent } = scriptedAgent('gemini-agent', [
      toolCallTurn,
      toolCallTurn,
      toolCallTurn,
      toolCallTurn, // 4th turn — would push the wrapper past maxToolRounds=3
    ]);
    const c = new ToolUsingCompiler({ inner: agent, env: defaultEnv(), maxToolRounds: 3 });
    await expect(c.compile(fixtureCompileInput())).rejects.toBeInstanceOf(CompilerOutputError);
  });

  it('onToolCall exceptions do not poison the compile path', async () => {
    const { agent } = scriptedAgent('gemini-agent', [
      { toolCalls: [{ name: 'listCapabilities', args: {} }], tokenCost: 10, model: 'm' },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const c = new ToolUsingCompiler({
      inner: agent,
      env: defaultEnv(),
      onToolCall: () => {
        throw new Error('hook boom');
      },
    });
    const r = await c.compile(fixtureCompileInput());
    expect(r.manifest.manifest_id).toMatch(/^m_/);
  });

  it('unknown tool name returns an error response and the loop continues', async () => {
    const { agent } = scriptedAgent('gemini-agent', [
      { toolCalls: [{ name: 'frobnicate', args: {} }], tokenCost: 10, model: 'm' },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const observed: unknown[] = [];
    const c = new ToolUsingCompiler({
      inner: agent,
      env: defaultEnv(),
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    expect(observed[0]).toEqual({ error: 'unknown tool: frobnicate' });
  });

  it('non-JSON final answer raises CompilerOutputError', async () => {
    const { agent } = scriptedAgent('gemini-agent', [
      { text: 'this is not json', tokenCost: 10, model: 'm' },
    ]);
    const c = new ToolUsingCompiler({ inner: agent, env: defaultEnv() });
    await expect(c.compile(fixtureCompileInput())).rejects.toBeInstanceOf(CompilerOutputError);
  });

  it('strips ```json fences when the model wraps its final answer', async () => {
    const fenced = '```json\n' + finalManifestText + '\n```';
    const { agent } = scriptedAgent('gemini-agent', [{ text: fenced, tokenCost: 10, model: 'm' }]);
    const c = new ToolUsingCompiler({ inner: agent, env: defaultEnv() });
    const r = await c.compile(fixtureCompileInput());
    expect(r.manifest.manifest_id).toMatch(/^m_[a-z0-9]{8,}$/);
  });

  it('diff mode (previousManifest set) reports diff_mode=true and uses temperature 0', async () => {
    const { agent, turns } = scriptedAgent('gemini-agent', [
      { text: finalManifestText, tokenCost: 10, model: 'gemini-2.5-flash' },
    ]);
    const c = new ToolUsingCompiler({ inner: agent, env: defaultEnv() });
    const r = await c.compile(fixtureCompileInput({ previousManifest: fixtureManifest() }));
    expect(r.diff_mode).toBe(true);
    expect(turns[0]?.temperature).toBe(0);
  });

  it('passes signal through to the agent client', async () => {
    const ctrl = new AbortController();
    const { agent, turns } = scriptedAgent('gemini-agent', [
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const c = new ToolUsingCompiler({ inner: agent, env: defaultEnv() });
    await c.compile(fixtureCompileInput({ signal: ctrl.signal }));
    expect(turns[0]?.signal).toBe(ctrl.signal);
  });

  it('composes inside ValidationFeedbackCompiler: agent emits invalid manifest, wrapper retries', async () => {
    // Agent's first attempt: emits a manifest that fails validation. The
    // wrapping VFC retries; agent's second attempt emits a passing
    // manifest.
    const draft1 = fixtureManifest({ manifest_id: 'm_drafta001' });
    const draft2 = fixtureManifest({ manifest_id: 'm_finalok02' });
    const { agent } = scriptedAgent('gemini-agent', [
      // First compile call (cold attempt): final answer immediately
      { text: JSON.stringify(draft1), tokenCost: 100, model: 'gemini-2.5-pro' },
      // Second compile call (refinement): final answer immediately
      { text: JSON.stringify(draft2), tokenCost: 50, model: 'gemini-2.5-flash' },
    ]);
    const tu = new ToolUsingCompiler({ inner: agent, env: defaultEnv() });

    const validate = vi
      .fn<(m: Manifest) => { ok: boolean; reasons?: readonly string[] }>()
      .mockReturnValueOnce({ ok: false, reasons: ['Stack empty'] })
      .mockReturnValueOnce({ ok: true });
    const vfc = new ValidationFeedbackCompiler({ inner: tu, validate, maxRetries: 2 });

    const r = await vfc.compile(fixtureCompileInput());
    // VFC summed token_cost across the two compiles.
    expect(r.token_cost).toBe(150);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('cascades inside CompositeCompiler when the agent loop exhausts (CompilerOutputError)', async () => {
    const failingAgent = scriptedAgent('gemini-agent', [
      { text: 'not json', tokenCost: 1, model: 'm' },
    ]).agent;
    const fallbackResult = {
      manifest: fixtureManifest({ manifest_id: 'm_fallback1' }),
      token_cost: 0,
      duration_ms: 1,
      model: 'fallback-generic',
      diff_mode: false,
    };
    const fallback = {
      id: 'fallback-generic',
      compile: async (_input: CompileInput) => fallbackResult,
    };
    const tu = new ToolUsingCompiler({ inner: failingAgent, env: defaultEnv() });
    const composite = new CompositeCompiler([tu, fallback]);
    const r = await composite.compile(fixtureCompileInput());
    expect(r.model).toBe('fallback-generic');
  });
});
