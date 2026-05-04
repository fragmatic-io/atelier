/* eslint-disable @typescript-eslint/require-await -- stub agents return Promises to satisfy AgentClient */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Integration test for the C-5 `findRecipe` tool. Drives the full
 * `ToolUsingCompiler` agent loop with a stub `AgentClient` and a
 * structurally-typed `RecipeResolverLike` so we can assert that:
 *
 *   - the tool reaches the resolver with the right query (text + topN)
 *   - the agent receives the SLIM projection (id, description,
 *     brand_kit_id, intent_surfaces, domain) — not the full manifest
 *   - resolver failures degrade gracefully to `{ recipes: [] }`
 *   - the tool returns `{ recipes: [] }` when no resolver is wired
 *   - `findRecipe` is included in the surfaced tool declarations
 *   - the slim projection drops `manifest`
 */

import { describe, expect, it } from 'vitest';
import { ToolUsingCompiler, type AgentClient } from '../src/tool-using-compiler.js';
import {
  slimRecipe,
  type RecipeQueryLike,
  type RecipeResolverLike,
  type ToolEnvironment,
} from '../src/tool-environment.js';
import { fixtureCompileInput, fixtureManifest } from './_fixtures.js';

const finalManifestText = JSON.stringify(fixtureManifest({ manifest_id: 'm_replaced0' }));

function scriptedAgent(
  responses: Array<{
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    text?: string;
    tokenCost: number;
    model: string;
  }>,
): { agent: AgentClient } {
  const queue = [...responses];
  const agent: AgentClient = {
    id: 'gemini-agent',
    generateTurn: async () => {
      const next = queue.shift();
      if (!next) throw new Error('scriptedAgent: no queued response');
      const out: {
        tokenCost: number;
        model: string;
        toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
        text?: string;
      } = {
        tokenCost: next.tokenCost,
        model: next.model,
      };
      if (next.toolCalls) out.toolCalls = next.toolCalls;
      if (next.text !== undefined) out.text = next.text;
      return out;
    },
  };
  return { agent };
}

const FAKE_RECIPES = [
  {
    id: 'github-reviewer',
    description: 'GH code reviewer — issues + PRs.',
    domain: 'issue-tracker',
    brand_kit_id: 'github-default',
    intent_surfaces: ['issues', 'pull requests'],
    manifest: { large: 'payload', that: 'should not leak' },
  },
  {
    id: 'jira-pm',
    description: 'Jira PM — sprints + backlog.',
    domain: 'issue-tracker',
    intent_surfaces: ['sprints'],
    manifest: { also: 'large' },
  },
];

function fakeResolver(seenQueries: RecipeQueryLike[]): RecipeResolverLike {
  return {
    resolve: async (q) => {
      seenQueries.push(q);
      return Promise.resolve({ recipes: FAKE_RECIPES, scores: [0.9, 0.5] });
    },
  };
}

function defaultEnv(): ToolEnvironment {
  return {
    capabilities: {},
    components: [],
  };
}

describe('findRecipe compiler tool', () => {
  it('agent receives the slim projection (no manifest payload)', async () => {
    const seen: RecipeQueryLike[] = [];
    const env: ToolEnvironment = { ...defaultEnv(), recipeResolver: fakeResolver(seen) };
    const observed: unknown[] = [];
    const { agent } = scriptedAgent([
      {
        toolCalls: [{ name: 'findRecipe', args: { query: { text: 'review code' }, topN: 3 } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const c = new ToolUsingCompiler({
      inner: agent,
      env,
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());

    expect(seen).toHaveLength(1);
    expect(seen[0]?.text).toBe('review code');
    expect(seen[0]?.topN).toBe(3);

    const result = observed[0] as {
      recipes: Array<{ id: string; manifest?: unknown }>;
      scores?: readonly number[];
    };
    expect(result.recipes).toHaveLength(2);
    expect(result.recipes[0]?.id).toBe('github-reviewer');
    // Slim projection — manifest must NOT leak through to the agent.
    for (const slim of result.recipes) {
      expect(slim).not.toHaveProperty('manifest');
    }
    expect(result.recipes[0]).toEqual({
      id: 'github-reviewer',
      description: 'GH code reviewer — issues + PRs.',
      domain: 'issue-tracker',
      brand_kit_id: 'github-default',
      intent_surfaces: ['issues', 'pull requests'],
    });
    expect(result.scores).toEqual([0.9, 0.5]);
  });

  it('defaults topN to 5 when the agent omits it', async () => {
    const seen: RecipeQueryLike[] = [];
    const env: ToolEnvironment = { ...defaultEnv(), recipeResolver: fakeResolver(seen) };
    const { agent } = scriptedAgent([
      {
        toolCalls: [{ name: 'findRecipe', args: { query: { text: 'x' } } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const c = new ToolUsingCompiler({ inner: agent, env });
    await c.compile(fixtureCompileInput());
    expect(seen[0]?.topN).toBe(5);
  });

  it('returns { recipes: [] } when no resolver is wired (graceful degrade)', async () => {
    const observed: unknown[] = [];
    const { agent } = scriptedAgent([
      {
        toolCalls: [{ name: 'findRecipe', args: { query: { text: 'x' } } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const c = new ToolUsingCompiler({
      inner: agent,
      env: defaultEnv(),
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    expect(observed[0]).toEqual({ recipes: [] });
  });

  it('handles malformed query argument by passing an empty query', async () => {
    const seen: RecipeQueryLike[] = [];
    const env: ToolEnvironment = { ...defaultEnv(), recipeResolver: fakeResolver(seen) };
    const { agent } = scriptedAgent([
      {
        // The agent might pass `query: null` if it gets confused; the
        // tool must coerce to {} rather than throw.
        toolCalls: [{ name: 'findRecipe', args: { query: null } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const c = new ToolUsingCompiler({ inner: agent, env });
    await c.compile(fixtureCompileInput());
    expect(seen).toHaveLength(1);
    // topN still defaults.
    expect(seen[0]?.topN).toBe(5);
  });

  it('resolver throw degrades to empty result (does not poison compile)', async () => {
    const env: ToolEnvironment = {
      ...defaultEnv(),
      recipeResolver: {
        resolve: async () => Promise.reject(new Error('embedding rate limit')),
      },
    };
    const observed: unknown[] = [];
    const { agent } = scriptedAgent([
      {
        toolCalls: [{ name: 'findRecipe', args: { query: { text: 'x' } } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const c = new ToolUsingCompiler({
      inner: agent,
      env,
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    expect(observed[0]).toEqual({ recipes: [] });
  });

  it('omits scores when the resolver does not produce them', async () => {
    const env: ToolEnvironment = {
      ...defaultEnv(),
      recipeResolver: {
        resolve: async () => Promise.resolve({ recipes: FAKE_RECIPES }),
      },
    };
    const observed: unknown[] = [];
    const { agent } = scriptedAgent([
      {
        toolCalls: [{ name: 'findRecipe', args: { query: { text: 'x' } } }],
        tokenCost: 10,
        model: 'm',
      },
      { text: finalManifestText, tokenCost: 10, model: 'm' },
    ]);
    const c = new ToolUsingCompiler({
      inner: agent,
      env,
      onToolCall: (_call, result) => observed.push(result),
    });
    await c.compile(fixtureCompileInput());
    const result = observed[0] as { recipes: unknown[]; scores?: unknown };
    expect(result.recipes).toHaveLength(2);
    expect(result.scores).toBeUndefined();
  });

  it('slimRecipe drops the manifest field and forwards optional metadata', () => {
    const slim = slimRecipe({
      id: 'r',
      description: 'd',
      manifest: { huge: 'blob' },
      domain: 'dom',
      brand_kit_id: 'bk',
      intent_surfaces: ['s'],
    });
    expect(slim).toEqual({
      id: 'r',
      description: 'd',
      domain: 'dom',
      brand_kit_id: 'bk',
      intent_surfaces: ['s'],
    });
    expect(slim).not.toHaveProperty('manifest');
  });

  it('findRecipe is surfaced in the tool declarations', async () => {
    let surfacedTools: readonly string[] = [];
    const agent: AgentClient = {
      id: 'gemini',
      generateTurn: async (req) => {
        surfacedTools = req.tools.map((t) => t.name);
        return Promise.resolve({ text: finalManifestText, tokenCost: 10, model: 'm' });
      },
    };
    const c = new ToolUsingCompiler({ inner: agent, env: defaultEnv() });
    await c.compile(fixtureCompileInput());
    expect(surfacedTools).toContain('findRecipe');
  });
});
