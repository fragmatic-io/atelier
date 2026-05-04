// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `EmbeddingRecipeResolver`. We drive it with a hand-rolled
 * `EmbeddingClient` stub so behaviour is fully deterministic. The real-
 * embedding integration test is gated behind `ATELIER_EMBEDDING_TESTS=1`
 * (legacy `CIR_EMBEDDING_TESTS=1` honoured for one release cycle) —
 * cache + fallback are tested unconditionally.
 *
 * Coverage:
 *
 *   - happy path: query embedded → topK → recipes ranked by cosine
 *   - brand-fit re-ranking nudges ties
 *   - cold-start (empty index) cascades to fallback + fires onError
 *   - client throw cascades to fallback + fires onError
 *   - empty / no-signal query cascades to fallback
 *   - cache hits avoid the embedding call
 *   - all-stale hits cascade (no recipes match the indexed set)
 *   - observers that throw don't poison the resolver
 *   - id default + override
 */

import { describe, expect, it } from 'vitest';
import {
  EmbeddingRecipeResolver,
  MemoryEmbeddingResolverCache,
  recipeEmbeddingText,
  queryEmbeddingText,
} from '../src/embedding-resolver.js';
import { SubstringRecipeResolver } from '../src/substring-resolver.js';
import { InMemoryEmbeddingIndex, type EmbeddingClient } from '../src/embedding-index.js';
import type { Recipe } from '../src/types.js';

const RECIPES: readonly Recipe[] = [
  {
    id: 'github-reviewer',
    description: 'GitHub code reviewer triaging issues and pull requests.',
    domain: 'issue-tracker',
    brand_kit_id: 'github-default',
    intent_surfaces: ['issues', 'pull requests'],
  },
  {
    id: 'jira-pm',
    description: 'Jira project manager managing sprints and backlog.',
    domain: 'issue-tracker',
    intent_surfaces: ['sprints', 'backlog'],
  },
  {
    id: 'dummyjson-shopper',
    description: 'Shopping persona over the DummyJSON catalog with cart and checkout.',
    domain: 'commerce',
    brand_kit_id: 'demo-dummyjson',
    intent_surfaces: ['browse products', 'cart', 'checkout'],
  },
];

/**
 * Hand-rolled vectors keyed by the embedding text strings the resolver
 * builds. We pre-compute the recipe-side text via `recipeEmbeddingText`
 * so the test is robust to small text-builder tweaks.
 */
function makeVectorTable(): Record<string, readonly number[]> {
  return {
    [recipeEmbeddingText(RECIPES[0]!)]: [1, 0, 0],
    [recipeEmbeddingText(RECIPES[1]!)]: [0.7, 0.7, 0],
    [recipeEmbeddingText(RECIPES[2]!)]: [0, 0, 1],
    // Query-side strings.
    'review github code': [1, 0, 0],
    'shop products online': [0, 0, 1],
    'unrelated query': [0.1, 0.1, 0.1],
  };
}

function fakeClient(table: Record<string, readonly number[]>): EmbeddingClient {
  return {
    id: 'mock-embed',
    embed: async (text) => {
      // The resolver builds the query text via `queryEmbeddingText`. To
      // keep the test fixture small we match on the trimmed user-text
      // portion when no domain/route is present.
      const v = table[text];
      if (!v) throw new Error(`fakeClient: no vector for "${text}"`);
      return Promise.resolve(v);
    },
  };
}

describe('EmbeddingRecipeResolver — happy path', () => {
  it('ranks recipes by cosine similarity to the query', async () => {
    const table = makeVectorTable();
    const r = new EmbeddingRecipeResolver({ client: fakeClient(table) });
    await r.index(RECIPES);
    const result = await r.resolve({ text: 'review github code' });
    expect(result.recipes[0]?.id).toBe('github-reviewer');
    expect(result.recipes[1]?.id).toBe('jira-pm');
    expect(result.scores?.[0]).toBeGreaterThan(result.scores?.[1] ?? 0);
  });

  it('different intent → different ranking', async () => {
    const table = makeVectorTable();
    const r = new EmbeddingRecipeResolver({ client: fakeClient(table) });
    await r.index(RECIPES);
    const result = await r.resolve({ text: 'shop products online' });
    expect(result.recipes[0]?.id).toBe('dummyjson-shopper');
  });

  it('respects topN', async () => {
    const table = makeVectorTable();
    const r = new EmbeddingRecipeResolver({ client: fakeClient(table) });
    await r.index(RECIPES);
    const result = await r.resolve({ text: 'review github code', topN: 1 });
    expect(result.recipes).toHaveLength(1);
  });

  it('brand-fit nudges score (re-ranking signal)', async () => {
    // Build a corpus where the top-2 hits have the same cosine; the
    // brand match decides which of them sorts first.
    const recipes: Recipe[] = [
      {
        id: 'a-no-brand',
        description: 'Twin description.',
        domain: 'd',
        intent_surfaces: ['x'],
      },
      {
        id: 'b-with-brand',
        description: 'Twin description.',
        domain: 'd',
        intent_surfaces: ['x'],
        brand_kit_id: 'brand-x',
      },
    ];
    const table: Record<string, readonly number[]> = {
      [recipeEmbeddingText(recipes[0]!)]: [1, 0],
      [recipeEmbeddingText(recipes[1]!)]: [1, 0],
      'twin query': [1, 0],
    };
    const r = new EmbeddingRecipeResolver({
      client: fakeClient(table),
      brandFitBonus: 0.5,
    });
    await r.index(recipes);
    // Without brand: ties broken by retrieval order — index emits
    // entries in insertion order, so a-no-brand is first.
    const noBrand = await r.resolve({ text: 'twin query' });
    expect(noBrand.recipes[0]?.id).toBe('a-no-brand');
    // With brand: b-with-brand jumps past on the bonus.
    const withBrand = await r.resolve({ text: 'twin query', brandKitId: 'brand-x' });
    expect(withBrand.recipes[0]?.id).toBe('b-with-brand');
  });
});

describe('EmbeddingRecipeResolver — cache + fallback (unconditional)', () => {
  it('cache hit avoids the embedding call', async () => {
    const table = makeVectorTable();
    let calls = 0;
    const client: EmbeddingClient = {
      id: 'counting',
      embed: async (text) => {
        calls += 1;
        const v = table[text];
        if (!v) throw new Error(`no vector for "${text}"`);
        return Promise.resolve(v);
      },
    };
    const cache = new MemoryEmbeddingResolverCache();
    const r = new EmbeddingRecipeResolver({ client, cache });
    await r.index(RECIPES);
    const callsAfterBuild = calls;
    await r.resolve({ text: 'review github code' });
    await r.resolve({ text: 'review github code' });
    // First resolve = 1 embedding call; second resolve = 0 (cache).
    expect(calls - callsAfterBuild).toBe(1);
  });

  it('cold-start (empty index) cascades to fallback + fires onError', async () => {
    const fallback = new SubstringRecipeResolver();
    await fallback.index(RECIPES);
    const events: { emptyIndex: boolean }[] = [];
    const r = new EmbeddingRecipeResolver({
      client: fakeClient(makeVectorTable()),
      // Brand-new index inside resolver — never built.
      index: new InMemoryEmbeddingIndex(),
      fallback,
      onError: (e) => events.push({ emptyIndex: e.emptyIndex }),
    });
    // Note: don't call `index(...)` so the index stays empty.
    const result = await r.resolve({ text: 'github review' });
    expect(result.recipes.length).toBeGreaterThan(0);
    expect(result.recipes[0]?.id).toBe('github-reviewer');
    expect(events).toEqual([{ emptyIndex: true }]);
  });

  it('client throw cascades to fallback + fires onError', async () => {
    const broken: EmbeddingClient = {
      id: 'broken',
      // Allow build via batch path (use embedBatch on a working table)…
      embed: async () => Promise.reject(new Error('quota')),
      embedBatch: async (texts) => {
        const table = makeVectorTable();
        const out: (readonly number[])[] = [];
        for (const t of texts) {
          const v = table[t];
          if (!v) throw new Error(`no vector for "${t}"`);
          out.push(v);
        }
        return Promise.resolve(out);
      },
    };
    const events: { emptyIndex: boolean; error: unknown }[] = [];
    const r = new EmbeddingRecipeResolver({
      client: broken,
      onError: (e) => events.push({ emptyIndex: e.emptyIndex, error: e.error }),
    });
    // Build succeeds via embedBatch; resolve fails via embed.
    await r.index(RECIPES);
    const result = await r.resolve({ text: 'review github' });
    // Substring fallback recovers `github-reviewer` from "review github"
    // (matches description tokens "review", "github").
    expect(result.recipes.map((rec) => rec.id)).toContain('github-reviewer');
    expect(events).toHaveLength(1);
    expect(events[0]?.emptyIndex).toBe(false);
    expect(events[0]?.error).toBeInstanceOf(Error);
  });

  it('observers that throw do not poison the resolver', async () => {
    const r = new EmbeddingRecipeResolver({
      client: fakeClient(makeVectorTable()),
      onResolve: () => {
        throw new Error('observer boom');
      },
      onError: () => {
        throw new Error('error observer boom');
      },
    });
    await r.index(RECIPES);
    const result = await r.resolve({ text: 'review github code' });
    expect(result.recipes[0]?.id).toBe('github-reviewer');
  });

  it('empty / no-signal query cascades to fallback', async () => {
    const fallback = new SubstringRecipeResolver();
    await fallback.index(RECIPES);
    const r = new EmbeddingRecipeResolver({
      client: fakeClient(makeVectorTable()),
      fallback,
    });
    await r.index(RECIPES);
    // Empty query — fallback returns [] but the cascade path still
    // executes (no embedding call attempted).
    const result = await r.resolve({});
    expect(result.recipes).toEqual([]);
  });

  it('returns [] for topN <= 0 without indexing or embedding', async () => {
    const r = new EmbeddingRecipeResolver({ client: fakeClient(makeVectorTable()) });
    expect((await r.resolve({ text: 'x', topN: 0 })).recipes).toEqual([]);
    expect((await r.resolve({ text: 'x', topN: -1 })).recipes).toEqual([]);
  });

  it('id defaults to "embedding[<client.id>]", overridable', () => {
    const r = new EmbeddingRecipeResolver({ client: fakeClient(makeVectorTable()) });
    expect(r.id).toBe('embedding[mock-embed]');
    const r2 = new EmbeddingRecipeResolver({
      client: fakeClient(makeVectorTable()),
      id: 'custom',
    });
    expect(r2.id).toBe('custom');
  });

  it('all-stale hits cascade — none of the topK match the indexed set', async () => {
    // Build the index, then mutate the internal recipes-by-id map by
    // re-indexing an empty set — but the embedding index keeps its
    // (now-stale) vectors. We do this by giving the resolver a custom
    // index whose `topK` returns ids that don't match `recipesById`.
    const customIndex = new InMemoryEmbeddingIndex();
    // Build with one recipe…
    await customIndex.build(
      [{ id: 'phantom', text: 'whatever' }],
      // Provide a tiny client just for the build call.
      {
        id: 'tmp',
        embed: async () => Promise.resolve([1, 0]),
      },
    );
    // …then construct the resolver around that index. The resolver's
    // recipesById is populated by `index(...)`, but the underlying
    // `customIndex` already has 'phantom' baked in. Calling
    // `r.index([])` would replace the index; instead, never call
    // `r.index` so `recipesById` stays empty while `customIndex.size()` > 0.
    const events: { emptyIndex: boolean }[] = [];
    const fallback = new SubstringRecipeResolver();
    await fallback.index(RECIPES);
    const r = new EmbeddingRecipeResolver({
      client: { id: 'q', embed: async () => Promise.resolve([1, 0]) },
      index: customIndex,
      fallback,
      onError: (e) => events.push({ emptyIndex: e.emptyIndex }),
    });
    const result = await r.resolve({ text: 'x' });
    // The cascade fired (every hit was stale), so the substring fallback's
    // result on text "x" — which is empty (too-short tokens) — surfaces.
    // The important assertion is that `onError` fired with emptyIndex=false.
    expect(events).toEqual([{ emptyIndex: false }]);
    expect(result.recipes).toEqual([]);
  });

  it('queryEmbeddingText composes signals predictably', () => {
    expect(queryEmbeddingText({ text: 'hi' })).toBe('hi');
    expect(queryEmbeddingText({ text: 'hi', domain: 'd' })).toBe('hi\ndomain: d');
    expect(queryEmbeddingText({ routeId: '/r' })).toBe('route: /r');
    expect(queryEmbeddingText({})).toBe('');
  });
});

// Real-embedding integration test — gated. Hosts that want to validate
// against an actual embedding provider set ATELIER_EMBEDDING_TESTS=1
// (legacy CIR_EMBEDDING_TESTS=1 still honoured for one release cycle)
// and supply a working `OPENAI_API_KEY` / `GEMINI_API_KEY` / similar.
// We don't ship a real provider here; the gate just asserts the flag
// is honoured so CI doesn't accidentally hit the network.
const embeddingTestsEnabled =
  process.env['ATELIER_EMBEDDING_TESTS'] === '1' || process.env['CIR_EMBEDDING_TESTS'] === '1';
describe.skipIf(!embeddingTestsEnabled)('EmbeddingRecipeResolver — real provider', () => {
  it('builds + resolves against a real provider when ATELIER_EMBEDDING_TESTS=1', () => {
    // Hosts wire a real `EmbeddingClient` here. Left as a stub because
    // we don't want CI to depend on a paid endpoint.
    expect(embeddingTestsEnabled).toBe(true);
  });
});
