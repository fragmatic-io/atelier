/* eslint-disable @typescript-eslint/require-await -- stub resolvers/agents must be Promise-returning to satisfy the contract */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the Wave C / Phase C-3 capability-scoping pre-pass.
 *
 * The compile pipeline gains an optional `CompileInput.capabilityResolver`
 * field. When set, the compiler invokes the resolver BEFORE prompt
 * assembly to narrow the registry to the top-N most relevant
 * capabilities for this route + intent. The narrowed set is what the
 * prompt + the C-2 `findCapability` tool sees; the FULL registry is
 * still reachable via `lookupCapability(id)` so the agent can broaden
 * by id when scoping was too tight.
 *
 * What we test here:
 *
 *   - resolver-off path — the full registry flows through unchanged
 *     (today's behaviour pre-C-3).
 *   - resolver-on path — only the top-N from the resolver land in the
 *     prompt-stuffed set; the agent's `findCapability` tool routes
 *     through the same scoped subset.
 *   - `lookupCapability(id)` ALWAYS hits the full registry — the
 *     broaden-by-id escape hatch.
 *   - resolver rejection cascades to "use the full registry" rather
 *     than failing the compile.
 *   - both shapes (`scope` and `resolve`) match the structural type;
 *     `scope` is preferred when both are present.
 *   - default `topN` is 30; the resolver call is short-circuited when
 *     the registry is already smaller than `topN`.
 */

import type { Capability, ComponentDefinition } from '@atelier/schemas';
import { describe, expect, it } from 'vitest';
import { applyCapabilityResolver, DEFAULT_RESOLVER_TOP_N } from '../src/capability-scoping.js';
import {
  ToolUsingCompiler,
  type AgentClient,
  type AgentTurnRequest,
  type AgentTurnResponse,
} from '../src/tool-using-compiler.js';
import type { CompileCapabilityResolver, ResolverQuery, ResolverResult } from '../src/types.js';
import { fixtureCompileInput, fixtureManifest } from './_fixtures.js';

// ---------------------------------------------------------------------------
// Fixtures — a 200-capability registry to exercise top-N narrowing past the
// 30-default. Each capability has an id and a one-line description so the
// substring-style resolver works. Ids are suffixed by domain so we can
// shape the resolver's picked subset deterministically.

function buildLargeRegistry(n: number): Record<string, Capability> {
  const out: Record<string, Capability> = {};
  for (let i = 0; i < n; i++) {
    const id = `cap.${String(i).padStart(3, '0')}`;
    out[id] = {
      id,
      kind: i % 2 === 0 ? 'data' : 'action',
      version: '1.0.0',
      description: `Capability number ${String(i)} (synthetic).`,
    } as unknown as Capability;
  }
  return out;
}

function buildComponents(): ComponentDefinition[] {
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
      description: 'Layout container.',
    } as unknown as ComponentDefinition,
  ];
}

/**
 * Resolver that returns a fixed list of capability ids. Used to drive
 * deterministic narrowing in the integration tests.
 */
function fixedResolver(ids: readonly string[], shape: 'scope' | 'resolve' = 'scope') {
  let scopeCalls = 0;
  let resolveCalls = 0;
  const scopeImpl = async (
    _req: { intent: string; route: string; userId: string; appId: string },
    k: number,
    registry: Readonly<Record<string, Capability>>,
  ): Promise<readonly { id: string; description?: string }[]> => {
    scopeCalls += 1;
    return ids
      .filter((id) => registry[id] !== undefined)
      .slice(0, k)
      .map((id) => {
        const desc = (registry[id] as { description?: string } | undefined)?.description;
        return desc !== undefined ? { id, description: desc } : { id };
      });
  };
  const resolveImpl = async (query: ResolverQuery): Promise<ResolverResult> => {
    resolveCalls += 1;
    return {
      capabilities: ids
        .slice(0, query.topN ?? DEFAULT_RESOLVER_TOP_N)
        .map((id) => ({ id }) as unknown as Capability),
    };
  };
  const r: CompileCapabilityResolver = {
    id: `fixed[${shape}]`,
    ...(shape === 'scope' ? { scope: scopeImpl } : { resolve: resolveImpl }),
  };
  return {
    resolver: r,
    get scopeCalls() {
      return scopeCalls;
    },
    get resolveCalls() {
      return resolveCalls;
    },
  };
}

/**
 * Stub agent that scripts successive `generateTurn` responses. Captures
 * each request so we can inspect what went into the prompt and what
 * tool calls were dispatched against which registry.
 */
function scriptedAgent(responses: ReadonlyArray<AgentTurnResponse>): {
  agent: AgentClient;
  turns: AgentTurnRequest[];
} {
  const queue = [...responses];
  const turns: AgentTurnRequest[] = [];
  const agent: AgentClient = {
    id: 'scripted-agent',
    generateTurn: async (req) => {
      turns.push(req);
      const next = queue.shift();
      if (next === undefined) throw new Error('scriptedAgent: no queued response');
      return next;
    },
  };
  return { agent, turns };
}

const FINAL_MANIFEST_TEXT = JSON.stringify(fixtureManifest());

// ---------------------------------------------------------------------------
// Unit tests for `applyCapabilityResolver` — the shared helper.

describe('applyCapabilityResolver', () => {
  it('returns the registry unchanged when no resolver is supplied', async () => {
    const reg = buildLargeRegistry(50);
    const out = await applyCapabilityResolver(fixtureCompileInput({ capabilities: reg }));
    expect(out).toBe(reg);
  });

  it('narrows to top-N via the scope() shape', async () => {
    const reg = buildLargeRegistry(200);
    const picked = ['cap.005', 'cap.010', 'cap.099', 'cap.150'];
    const { resolver } = fixedResolver(picked, 'scope');
    const out = await applyCapabilityResolver(
      fixtureCompileInput({
        capabilities: reg,
        capabilityResolver: resolver,
        topN: 30,
      }),
    );
    expect(Object.keys(out)).toEqual(picked);
  });

  it('narrows to top-N via the resolve() shape', async () => {
    const reg = buildLargeRegistry(200);
    // Same picked ids, but using the high-level resolve() entry-point.
    const picked = ['cap.005', 'cap.010', 'cap.099'];
    const r: CompileCapabilityResolver = {
      id: 'fixed[resolve]',
      resolve: async (q) => ({
        capabilities: picked
          .slice(0, q.topN ?? 30)
          .map((id) => reg[id])
          .filter((c): c is Capability => c !== undefined),
      }),
    };
    const out = await applyCapabilityResolver(
      fixtureCompileInput({
        capabilities: reg,
        capabilityResolver: r,
        topN: 30,
      }),
    );
    expect(Object.keys(out)).toEqual(picked);
  });

  it('prefers scope() when the resolver implements both shapes', async () => {
    const reg = buildLargeRegistry(50);
    const r: CompileCapabilityResolver = {
      id: 'fixed[both]',
      scope: async () => [{ id: 'cap.001' }],
      resolve: async () => ({ capabilities: [reg['cap.042']!] }),
    };
    const out = await applyCapabilityResolver(
      fixtureCompileInput({
        capabilities: reg,
        capabilityResolver: r,
        topN: 30,
      }),
    );
    // `scope` won → only cap.001.
    expect(Object.keys(out)).toEqual(['cap.001']);
  });

  it('skips the resolver call when the registry is already <= topN', async () => {
    const reg = buildLargeRegistry(20);
    const { resolver, scopeCalls } = ((): {
      resolver: CompileCapabilityResolver;
      scopeCalls: () => number;
    } => {
      let calls = 0;
      const r: CompileCapabilityResolver = {
        id: 'noop',
        scope: async () => {
          calls += 1;
          return [];
        },
      };
      return { resolver: r, scopeCalls: () => calls };
    })();
    const out = await applyCapabilityResolver(
      fixtureCompileInput({
        capabilities: reg,
        capabilityResolver: resolver,
        topN: 30,
      }),
    );
    expect(out).toBe(reg);
    expect(scopeCalls()).toBe(0);
  });

  it('cascades to the full registry on resolver throw + reports onError', async () => {
    const reg = buildLargeRegistry(100);
    const r: CompileCapabilityResolver = {
      id: 'broken',
      scope: async () => Promise.reject(new Error('stage-1 quota')),
    };
    const errs: unknown[] = [];
    const out = await applyCapabilityResolver(
      fixtureCompileInput({
        capabilities: reg,
        capabilityResolver: r,
        topN: 10,
      }),
      { onError: (e) => errs.push(e) },
    );
    expect(out).toBe(reg);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toBeInstanceOf(Error);
  });

  it('cascades to the full registry when the resolver returns []', async () => {
    const reg = buildLargeRegistry(100);
    const r: CompileCapabilityResolver = {
      id: 'empty',
      scope: async () => [],
    };
    const out = await applyCapabilityResolver(
      fixtureCompileInput({
        capabilities: reg,
        capabilityResolver: r,
        topN: 10,
      }),
    );
    expect(out).toBe(reg);
  });

  it('drops resolver-supplied ids that no longer exist in the live registry', async () => {
    const reg = buildLargeRegistry(50);
    const picked = ['cap.001', 'invented.id', 'cap.020', 'also.invented'];
    const r: CompileCapabilityResolver = {
      id: 'partly-invented',
      scope: async () => picked.map((id) => ({ id })),
    };
    const out = await applyCapabilityResolver(
      fixtureCompileInput({
        capabilities: reg,
        capabilityResolver: r,
        topN: 10,
      }),
    );
    expect(Object.keys(out)).toEqual(['cap.001', 'cap.020']);
  });

  it('cascades to the full registry when EVERY resolver-supplied id is invented', async () => {
    const reg = buildLargeRegistry(50);
    const r: CompileCapabilityResolver = {
      id: 'fully-invented',
      scope: async () => [{ id: 'invented.a' }, { id: 'invented.b' }],
    };
    const out = await applyCapabilityResolver(
      fixtureCompileInput({
        capabilities: reg,
        capabilityResolver: r,
        topN: 10,
      }),
    );
    expect(out).toBe(reg);
  });

  it('uses DEFAULT_RESOLVER_TOP_N (30) when topN is unset', async () => {
    const reg = buildLargeRegistry(200);
    let receivedK = -1;
    const r: CompileCapabilityResolver = {
      id: 'k-capture',
      scope: async (_req, k) => {
        receivedK = k;
        return [{ id: 'cap.000' }];
      },
    };
    await applyCapabilityResolver(
      fixtureCompileInput({
        capabilities: reg,
        capabilityResolver: r,
      }),
    );
    expect(receivedK).toBe(DEFAULT_RESOLVER_TOP_N);
  });
});

// ---------------------------------------------------------------------------
// Integration tests through `ToolUsingCompiler`.

describe('ToolUsingCompiler — capability scoping integration', () => {
  it('compile with no resolver — full capabilities reach the agent', async () => {
    const reg = buildLargeRegistry(40);
    // Agent immediately calls `findCapability` then emits the manifest.
    const { agent } = scriptedAgent([
      {
        toolCalls: [{ id: 't1', name: 'findCapability', args: { intent: 'cap', k: 5 } }],
        tokenCost: 100,
        model: 'gemini-2.5-pro',
      },
      { text: FINAL_MANIFEST_TEXT, tokenCost: 200, model: 'gemini-2.5-pro' },
    ]);
    const findCalls: { result: unknown }[] = [];
    const c = new ToolUsingCompiler({
      validationMode: 'permissive',
      inner: agent,
      env: { capabilities: reg, components: buildComponents() },
      onToolCall: (call, result) => {
        if (call.name === 'findCapability') findCalls.push({ result });
      },
    });
    await c.compile(
      fixtureCompileInput({
        capabilities: reg,
        components: buildComponents(),
      }),
    );
    // Without scoping the substring fallback runs across the FULL 40-cap
    // registry. The query "cap" matches every id (each starts with
    // "cap."), so we get k=5 back.
    expect(findCalls).toHaveLength(1);
    const refs = findCalls[0]?.result as Array<{ id: string }>;
    expect(refs).toHaveLength(5);
  });

  it('compile with a resolver — findCapability sees only the scoped subset', async () => {
    const reg = buildLargeRegistry(200);
    // Resolver picks 3 ids; `findCapability` should only see those 3.
    const picked = ['cap.005', 'cap.099', 'cap.150'];
    const { resolver } = fixedResolver(picked, 'scope');
    const { agent } = scriptedAgent([
      {
        toolCalls: [{ id: 't1', name: 'findCapability', args: { intent: 'cap', k: 100 } }],
        tokenCost: 100,
        model: 'gemini-2.5-pro',
      },
      { text: FINAL_MANIFEST_TEXT, tokenCost: 200, model: 'gemini-2.5-pro' },
    ]);
    const findCalls: { result: unknown }[] = [];
    const c = new ToolUsingCompiler({
      validationMode: 'permissive',
      inner: agent,
      env: { capabilities: reg, components: buildComponents() },
      onToolCall: (call, result) => {
        if (call.name === 'findCapability') findCalls.push({ result });
      },
    });
    await c.compile(
      fixtureCompileInput({
        capabilities: reg,
        components: buildComponents(),
        capabilityResolver: resolver,
        topN: 30,
      }),
    );
    // Even though the agent asked for k=100, the scoped subset only has
    // 3 matching ids — the resolver's pre-pass truncated the search
    // surface.
    expect(findCalls).toHaveLength(1);
    const refs = findCalls[0]?.result as Array<{ id: string }>;
    expect(refs.map((r) => r.id).sort()).toEqual(picked.slice().sort());
  });

  it('lookupCapability(id) hits the FULL registry even when scoping is on', async () => {
    const reg = buildLargeRegistry(200);
    // Resolver narrows to a single id; the agent then asks for a
    // DIFFERENT id by name (the broaden-by-id escape hatch).
    const { resolver } = fixedResolver(['cap.005'], 'scope');
    const { agent } = scriptedAgent([
      {
        toolCalls: [{ id: 't1', name: 'lookupCapability', args: { id: 'cap.099' } }],
        tokenCost: 100,
        model: 'gemini-2.5-pro',
      },
      { text: FINAL_MANIFEST_TEXT, tokenCost: 200, model: 'gemini-2.5-pro' },
    ]);
    const lookupResults: unknown[] = [];
    const c = new ToolUsingCompiler({
      validationMode: 'permissive',
      inner: agent,
      env: { capabilities: reg, components: buildComponents() },
      onToolCall: (call, result) => {
        if (call.name === 'lookupCapability') lookupResults.push(result);
      },
    });
    await c.compile(
      fixtureCompileInput({
        capabilities: reg,
        components: buildComponents(),
        capabilityResolver: resolver,
        topN: 30,
      }),
    );
    // The agent successfully fetched cap.099 even though the resolver
    // didn't pick it — the full registry remains reachable.
    expect(lookupResults).toHaveLength(1);
    expect(lookupResults[0]).toMatchObject({ id: 'cap.099' });
  });

  it('listCapabilities sees the FULL registry (broaden by domain/tag)', async () => {
    const reg = buildLargeRegistry(50);
    const { resolver } = fixedResolver(['cap.005'], 'scope');
    const { agent } = scriptedAgent([
      {
        toolCalls: [{ id: 't1', name: 'listCapabilities', args: {} }],
        tokenCost: 100,
        model: 'gemini-2.5-pro',
      },
      { text: FINAL_MANIFEST_TEXT, tokenCost: 200, model: 'gemini-2.5-pro' },
    ]);
    const listResults: unknown[] = [];
    const c = new ToolUsingCompiler({
      validationMode: 'permissive',
      inner: agent,
      env: { capabilities: reg, components: buildComponents() },
      onToolCall: (call, result) => {
        if (call.name === 'listCapabilities') listResults.push(result);
      },
    });
    await c.compile(
      fixtureCompileInput({
        capabilities: reg,
        components: buildComponents(),
        capabilityResolver: resolver,
        topN: 30,
      }),
    );
    expect(listResults).toHaveLength(1);
    const refs = listResults[0] as Array<{ id: string }>;
    // FULL 50-cap registry, not just the scoped 1.
    expect(refs).toHaveLength(50);
  });

  it('resolver rejection cascades — compile still succeeds with full registry', async () => {
    const reg = buildLargeRegistry(50);
    const broken: CompileCapabilityResolver = {
      id: 'broken',
      scope: async () => Promise.reject(new Error('stage-1 timeout')),
    };
    const { agent } = scriptedAgent([
      {
        toolCalls: [{ id: 't1', name: 'findCapability', args: { intent: 'cap', k: 5 } }],
        tokenCost: 100,
        model: 'gemini-2.5-pro',
      },
      { text: FINAL_MANIFEST_TEXT, tokenCost: 200, model: 'gemini-2.5-pro' },
    ]);
    const findCalls: { result: unknown }[] = [];
    const c = new ToolUsingCompiler({
      validationMode: 'permissive',
      inner: agent,
      env: { capabilities: reg, components: buildComponents() },
      onToolCall: (call, result) => {
        if (call.name === 'findCapability') findCalls.push({ result });
      },
    });
    const r = await c.compile(
      fixtureCompileInput({
        capabilities: reg,
        components: buildComponents(),
        capabilityResolver: broken,
        topN: 10,
      }),
    );
    expect(r.manifest).toBeDefined();
    // Cascade fell through to the full registry — `findCapability`
    // returns 5 hits from the full 50-cap set.
    expect(findCalls).toHaveLength(1);
    const refs = findCalls[0]?.result as Array<{ id: string }>;
    expect(refs).toHaveLength(5);
  });
});
