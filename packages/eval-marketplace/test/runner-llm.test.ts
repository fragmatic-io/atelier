// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `runMarketplaceEval({ mode: 'real-llm' })`.
 *
 * The runner's contract is "if a compile reports token / duration data,
 * fold it into the persona's `llm` block + the report summary." We
 * exercise that path with an injected fake `compile` impl rather than
 * calling Gemini for real — the GeminiCompiler wiring itself is covered
 * by `@atelier/compiler` tests.
 */

import { describe, expect, it } from 'vitest';

import type { Manifest, MarketplaceAddress } from '@atelier/schemas';

import { runMarketplaceEval } from '../src/runner.js';
import type {
  ApprovedPersonaList,
  BundleFetcher,
  CompileFn,
  ReferenceFixtures,
} from '../src/types.js';
import { REFERENCE_CAPABILITIES, REFERENCE_COMPONENTS } from '../src/fixtures/index.js';

const FIXTURES: ReferenceFixtures = {
  capabilities: REFERENCE_CAPABILITIES,
  components: REFERENCE_COMPONENTS,
};

function addr(persona: string, version = '1.0.0'): MarketplaceAddress {
  return { scheme: 'atelier', author: 'acme', persona, version };
}

function validRecipe(persona: string): Manifest {
  return {
    manifest_id: `m_${persona.replace(/-/g, '').padEnd(8, '0')}`,
    user_id: 'eval-user',
    app_id: `acme.${persona}`,
    compiled_from: {
      capability_version: '0.1.0',
      skill_versions: {},
      component_catalog_version: '0.1.0',
      intent_profile_version: 0,
      compiler_model: 'recipe-author',
      compiled_at: '2026-05-01T00:00:00Z',
    },
    ttl: null,
    invalidates_on: [],
    routes: [
      {
        path: '/',
        title: 'Home',
        layout: {
          component: 'Stack',
          props: { direction: 'vertical', gap: 'md' },
          children: [{ component: 'Markdown', props: { content: '# Welcome' } }],
        },
      },
    ],
    policies_satisfied: ['empty_loading_error_handled'],
  };
}

class StaticApproved implements ApprovedPersonaList {
  constructor(private readonly addresses: MarketplaceAddress[]) {}
  list() {
    return this.addresses;
  }
}

class InMemoryFetcher implements BundleFetcher {
  constructor(private readonly bundles: Map<string, unknown>) {}
  fetch(address: MarketplaceAddress): Promise<unknown> {
    const key = `${address.author}/${address.persona}@${address.version}`;
    return Promise.resolve(this.bundles.get(key) ?? null);
  }
}

function key(a: MarketplaceAddress): string {
  return `${a.author}/${a.persona}@${a.version}`;
}

/**
 * Fake `compile` that returns the recipe verbatim AND reports token /
 * duration telemetry. Mirrors the shape `buildRealLlmCompile` would
 * return without actually calling Gemini.
 */
function fakeLlmCompile(opts: {
  model: string;
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
}): CompileFn {
  return ({ recipe, route }) => {
    const target = recipe.routes.find((r) => r.path === route);
    if (target === undefined) throw new Error(`route '${route}' not present`);
    const compiled: Manifest = {
      ...recipe,
      routes: [target],
      compiled_from: { ...recipe.compiled_from, compiler_model: opts.model },
    };
    return Promise.resolve({
      manifest: compiled,
      model: opts.model,
      tokens_input: opts.tokensInput,
      tokens_output: opts.tokensOutput,
      duration_ms: opts.durationMs,
    });
  };
}

describe("runMarketplaceEval mode='real-llm'", () => {
  it('attaches an llm block per persona with token + cost data', async () => {
    const a1 = addr('persona-a');
    const a2 = addr('persona-b');
    const bundles = new Map<string, unknown>([
      [key(a1), validRecipe('persona-a')],
      [key(a2), validRecipe('persona-b')],
    ]);
    const report = await runMarketplaceEval({
      approved: new StaticApproved([a1, a2]),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: null,
      mode: 'real-llm',
      // Inject the fake compile directly — `mode: 'real-llm'` plus an
      // explicit `compile` skips the Gemini lazy-build.
      compile: fakeLlmCompile({
        model: 'gemini-2.5-flash',
        tokensInput: 4_000,
        tokensOutput: 1_000,
        durationMs: 800,
      }),
      now: () => 0,
    });

    // Both personas pass the validation stack.
    expect(report.summary.passed).toBe(2);
    expect(report.summary.failed).toBe(0);
    // Each persona has an `llm` block.
    for (const p of report.personas) {
      expect(p.llm).toBeDefined();
      expect(p.llm?.mode).toBe('real-llm');
      expect(p.llm?.model).toBe('gemini-2.5-flash');
      expect(p.llm?.tokens_input).toBe(4_000);
      expect(p.llm?.tokens_output).toBe(1_000);
      // 4000 in + 1000 out at flash rates: 0.0012 + 0.0025 = 0.0037 USD
      expect(p.llm?.cost_usd).toBeCloseTo(0.0037, 6);
      expect(p.llm?.compile_duration_ms).toBe(800);
      // Shape hash is a 64-char hex string.
      expect(p.llm?.manifest_shape_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('summarises cost columns when at least one persona produced an llm row', async () => {
    const a1 = addr('persona-a');
    const a2 = addr('persona-b');
    const bundles = new Map<string, unknown>([
      [key(a1), validRecipe('persona-a')],
      [key(a2), validRecipe('persona-b')],
    ]);
    const report = await runMarketplaceEval({
      approved: new StaticApproved([a1, a2]),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: null,
      mode: 'real-llm',
      compile: fakeLlmCompile({
        model: 'gemini-2.5-flash',
        tokensInput: 4_000,
        tokensOutput: 1_000,
        durationMs: 800,
      }),
      now: () => 0,
    });

    expect(report.summary.total_cost_usd).toBeCloseTo(0.0074, 6);
    expect(report.summary.cost_per_persona_avg_usd).toBeCloseTo(0.0037, 6);
    expect(report.summary.cost_per_persona_p95_usd).toBeCloseTo(0.0037, 6);
    expect(report.summary.total_tokens_input).toBe(8_000);
    expect(report.summary.total_tokens_output).toBe(2_000);
    expect(report.summary.pricing_revision).toBeTruthy();
  });

  it('shape-hashes the same recipe to the same value across runs', async () => {
    const a1 = addr('persona-stable');
    const bundles = new Map<string, unknown>([[key(a1), validRecipe('persona-stable')]]);
    const compile = fakeLlmCompile({
      model: 'gemini-2.5-flash',
      tokensInput: 100,
      tokensOutput: 50,
      durationMs: 10,
    });
    const r1 = await runMarketplaceEval({
      approved: new StaticApproved([a1]),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: null,
      mode: 'real-llm',
      compile,
      now: () => 0,
    });
    const r2 = await runMarketplaceEval({
      approved: new StaticApproved([a1]),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: null,
      mode: 'real-llm',
      compile,
      now: () => 0,
    });
    expect(r1.personas[0]?.llm?.manifest_shape_hash).toBe(r2.personas[0]?.llm?.manifest_shape_hash);
  });

  it("strips manifest_id before hashing so server-stamp rotation doesn't perturb the shape hash", async () => {
    const a1 = addr('persona-stable');
    const bundles = new Map<string, unknown>([[key(a1), validRecipe('persona-stable')]]);
    // Two compiles that differ ONLY in the auto-generated manifest_id —
    // shape hash must agree.
    const compileA: CompileFn = ({ recipe, route }) => {
      const target = recipe.routes.find((r) => r.path === route);
      if (target === undefined) throw new Error('route not present');
      return Promise.resolve({
        manifest: { ...recipe, manifest_id: 'm_aaaaaaaa', routes: [target] },
        model: 'gemini-2.5-flash',
        tokens_input: 1,
        tokens_output: 1,
        duration_ms: 1,
      });
    };
    const compileB: CompileFn = ({ recipe, route }) => {
      const target = recipe.routes.find((r) => r.path === route);
      if (target === undefined) throw new Error('route not present');
      return Promise.resolve({
        manifest: { ...recipe, manifest_id: 'm_bbbbbbbb', routes: [target] },
        model: 'gemini-2.5-flash',
        tokens_input: 1,
        tokens_output: 1,
        duration_ms: 1,
      });
    };
    const r1 = await runMarketplaceEval({
      approved: new StaticApproved([a1]),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: null,
      mode: 'real-llm',
      compile: compileA,
      now: () => 0,
    });
    const r2 = await runMarketplaceEval({
      approved: new StaticApproved([a1]),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: null,
      mode: 'real-llm',
      compile: compileB,
      now: () => 0,
    });
    expect(r1.personas[0]?.llm?.manifest_shape_hash).toBe(r2.personas[0]?.llm?.manifest_shape_hash);
  });

  it('throws a descriptive error when real-llm mode is set without a key + no compile injection', async () => {
    const a1 = addr('persona-a');
    const bundles = new Map<string, unknown>([[key(a1), validRecipe('persona-a')]]);
    await expect(
      runMarketplaceEval({
        approved: new StaticApproved([a1]),
        fetcher: new InMemoryFetcher(bundles),
        fixtures: FIXTURES,
        verify: null,
        mode: 'real-llm',
        now: () => 0,
      }),
    ).rejects.toThrow(/geminiApiKey/);
  });

  it('deterministic mode (default) does not produce an llm block', async () => {
    const a1 = addr('persona-a');
    const bundles = new Map<string, unknown>([[key(a1), validRecipe('persona-a')]]);
    const report = await runMarketplaceEval({
      approved: new StaticApproved([a1]),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: null,
      now: () => 0,
    });
    expect(report.personas[0]?.llm).toBeUndefined();
    expect(report.summary.total_cost_usd).toBeUndefined();
    expect(report.summary.cost_per_persona_avg_usd).toBeUndefined();
  });
});
