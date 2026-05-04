// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `SubstringRecipeResolver`. The resolver is the cheap,
 * deterministic baseline for recipe RAG. We assert:
 *
 *   - exact id match wins outright
 *   - prefix id match beats text match
 *   - domain match beats text-only match (the spec: "domain wins, then
 *     text, then brand fit")
 *   - text term overlap counts contribute to the score
 *   - brand-fit acts as a tie-breaker / re-ranking nudge
 *   - topN clamps; empty corpus / empty query short-circuit cleanly
 *   - id default + override
 *   - re-indexing replaces the corpus
 */

import { describe, expect, it } from 'vitest';
import { SubstringRecipeResolver } from '../src/substring-resolver.js';
import { FIXTURE_RECIPES } from './_fixtures.js';

async function indexed(): Promise<SubstringRecipeResolver> {
  const r = new SubstringRecipeResolver();
  await r.index(FIXTURE_RECIPES);
  return r;
}

describe('SubstringRecipeResolver', () => {
  it('returns up to top-5 by default for a known query, ordered by score', async () => {
    const r = await indexed();
    // "manager" appears in many recipe descriptions/intent_surfaces, so
    // the top-5 cap binds.
    const result = await r.resolve({ text: 'manager' });
    expect(result.recipes).toHaveLength(5);
    expect(result.scores).toHaveLength(5);
    // Scores monotonic non-increasing.
    for (let i = 1; i < (result.scores?.length ?? 0); i++) {
      expect(result.scores?.[i - 1] ?? 0).toBeGreaterThanOrEqual(result.scores?.[i] ?? 0);
    }
  });

  it('exact match still tops the list', async () => {
    const r = await indexed();
    const result = await r.resolve({ text: 'github-reviewer' });
    expect(result.recipes[0]?.id).toBe('github-reviewer');
  });

  it('exact id match wins outright over a perfect text match', async () => {
    const r = await indexed();
    // `text: "linear-eng"` matches the id exactly. Other recipes might
    // score higher on raw text-term overlap if exact match weren't
    // wedged above; assert the exact match still wins.
    const result = await r.resolve({ text: 'linear-eng' });
    expect(result.recipes[0]?.id).toBe('linear-eng');
  });

  it('prefix id match outranks plain text-term overlap', async () => {
    const r = await indexed();
    const result = await r.resolve({ text: 'github' });
    // `github-reviewer` is a prefix match (500). Other recipes might
    // mention "github" only in their description (10).
    expect(result.recipes[0]?.id).toBe('github-reviewer');
  });

  it('domain match beats text-only match (spec: "domain wins, then text")', async () => {
    const r = await indexed();
    // The query text "manager" matches multiple recipes' descriptions,
    // but we constrain by domain — only recipes in the issue-tracker
    // domain should bubble up first.
    const result = await r.resolve({ text: 'manager', domain: 'issue-tracker' });
    expect(result.recipes.length).toBeGreaterThan(0);
    // Every top result must be in the issue-tracker domain — domain
    // adds 200 to score, text adds at most ~30 for plausible queries,
    // so domain results dominate.
    for (const recipe of result.recipes) {
      expect(recipe.domain).toBe('issue-tracker');
    }
    // `release-manager` and `jira-pm` etc are issue-tracker; should be
    // in the top results.
    const ids = result.recipes.map((rec) => rec.id);
    expect(ids).toContain('release-manager');
  });

  it('brand-fit acts as a tie-breaker (spec: "then brand fit")', async () => {
    const r = await indexed();
    // Two recipes carry "github" in their text fields, but only
    // `github-reviewer` has brand_kit_id="github-default". Set both
    // signals; assert brand-tagged one wins ties.
    const a = await r.resolve({ text: 'reviewer', brandKitId: 'github-default' });
    const b = await r.resolve({ text: 'reviewer' });
    // Both queries return github-reviewer first (prefix-style "reviewer"
    // is in github-reviewer's description+id but the brand bonus only
    // affects ties). The differentiator: brand-fit shifts secondary
    // ordering.
    expect(a.recipes[0]?.id).toBe('github-reviewer');
    expect(b.recipes[0]?.id).toBe('github-reviewer');
    // Score gap: brand-tagged result should score higher than the
    // brandless equivalent.
    const aScore = a.scores?.[0] ?? 0;
    const bScore = b.scores?.[0] ?? 0;
    expect(aScore).toBeGreaterThan(bScore);
  });

  it('text term overlap accumulates score', async () => {
    const r = await indexed();
    // `pipeline opportunities` matches sales-rep's intent_surfaces and
    // description twice each; should rank #1.
    const result = await r.resolve({ text: 'pipeline opportunities' });
    expect(result.recipes[0]?.id).toBe('sales-rep');
  });

  it('respects topN', async () => {
    const r = await indexed();
    const result = await r.resolve({ text: 'manager', topN: 3 });
    expect(result.recipes).toHaveLength(3);
    expect(result.scores).toHaveLength(3);
  });

  it('returns [] for empty corpus', async () => {
    const r = new SubstringRecipeResolver();
    const result = await r.resolve({ text: 'github' });
    expect(result.recipes).toEqual([]);
    expect(result.scores).toEqual([]);
  });

  it('returns [] for queries with zero signal', async () => {
    const r = await indexed();
    const result = await r.resolve({});
    expect(result.recipes).toEqual([]);
  });

  it('returns [] when topN <= 0', async () => {
    const r = await indexed();
    expect((await r.resolve({ text: 'github', topN: 0 })).recipes).toEqual([]);
    expect((await r.resolve({ text: 'github', topN: -1 })).recipes).toEqual([]);
  });

  it('drops short tokens via minTermLength', async () => {
    const r = new SubstringRecipeResolver({ minTermLength: 4 });
    await r.index(FIXTURE_RECIPES);
    // "qa" is too short (length 2 < 4) — query falls back to no terms.
    const result = await r.resolve({ text: 'qa' });
    expect(result.recipes).toEqual([]);
  });

  it('id defaults to "substring", overridable', () => {
    expect(new SubstringRecipeResolver().id).toBe('substring');
    expect(new SubstringRecipeResolver({ id: 'custom' }).id).toBe('custom');
  });

  it('re-index replaces the corpus', async () => {
    const r = new SubstringRecipeResolver();
    await r.index(FIXTURE_RECIPES);
    expect(r.size()).toBe(30);
    await r.index(FIXTURE_RECIPES.slice(0, 3));
    expect(r.size()).toBe(3);
  });

  it('domain-only query returns recipes from that domain', async () => {
    const r = await indexed();
    const result = await r.resolve({ domain: 'crm', topN: 5 });
    expect(result.recipes.length).toBeGreaterThan(0);
    for (const recipe of result.recipes) {
      expect(recipe.domain).toBe('crm');
    }
  });

  it('brand-only query returns recipes with that brand', async () => {
    const r = await indexed();
    const result = await r.resolve({ brandKitId: 'github-default' });
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0]?.id).toBe('github-reviewer');
  });

  it('scoreSync gives synchronous access for re-rankers', () => {
    const r = new SubstringRecipeResolver();
    // Synchronous index path via a direct constructor cycle — call
    // index with no await is the same effect since substring is sync.
    void r.index(FIXTURE_RECIPES);
    const result = r.scoreSync({ text: 'github' });
    expect(result.recipes[0]?.id).toBe('github-reviewer');
  });
});
