// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `SubstringRecipeResolver` — the baseline recipe retrieval. No LLM call;
 * pure exact + prefix + substring + brand-id match against a recipe's
 * description / domain / intent surfaces / brand kit. This serves as:
 *
 *   - the cheap, deterministic baseline shipped to hosts that don't want
 *     an embedding pipeline,
 *   - the fallback the embedding resolver cascades to on client failure
 *     or cold start,
 *   - the deterministic baseline tests assert against.
 *
 * Scoring shape (higher wins; ties broken by index insertion order):
 *
 *   1. **Exact match** on recipe id (e.g. `query.text = "github-reviewer"`).
 *      Score = 1000 — wins outright. The resolver intentionally wedges
 *      this above every other signal so hosts can short-circuit retrieval
 *      with an explicit id.
 *   2. **Prefix match** on recipe id (e.g. `query.text = "github"` →
 *      `github-reviewer`). Score = 500. Below exact, above text.
 *   3. **Domain match.** When `query.domain === recipe.domain`, score
 *      gains 200. We weight this above text because a domain hint is a
 *      structured signal (the host knows what it's asking for).
 *   4. **Text match** — count of distinct query terms that substring-
 *      match the recipe's id / description / domain / intent surfaces.
 *      Each term contributes 10. (The 10x multiplier exists so a recipe
 *      matching 3 terms still beats one matching 2 + a brand id, which
 *      is the right order for a free-form text query.)
 *   5. **Brand-fit** — when `query.brandKitId === recipe.brand_kit_id`,
 *      score gains 5. A re-ranking nudge, not a primary signal.
 *
 * The numeric weights are intentionally readable rather than tuned —
 * this is the baseline; the embedding resolver is the place to invest
 * in calibrated relevance.
 */

import type { Recipe, RecipeQuery, RecipeResolver, RecipeResolverResult } from './types.js';
import { DEFAULT_TOP_N } from './types.js';

/**
 * Tunables for the substring resolver. None are required — defaults
 * match the C-5 baseline contract.
 */
export interface SubstringRecipeResolverOptions {
  /**
   * Override the resolver `id`. Defaults to `'substring'`. Hosts that
   * wrap the resolver in a side-effect-only middleware sometimes set
   * this to a more descriptive identifier for audit.
   */
  id?: string;
  /**
   * Minimum term length. Tokens shorter than this are dropped. Default
   * 2 — guards against a single-letter typo dragging in every recipe
   * whose description contains that letter. Set to 1 to disable.
   */
  minTermLength?: number;
}

const SCORE_EXACT_ID = 1000;
const SCORE_PREFIX_ID = 500;
const SCORE_DOMAIN = 200;
const SCORE_TEXT_TERM = 10;
const SCORE_BRAND = 5;

/**
 * Lowercase, whitespace-split, length-filtered tokenization. Same shape
 * as `@atelier/capability-resolver`'s tokenizer so the two stories
 * agree about what "matches the query" means.
 */
function tokenize(text: string, minTermLength: number): readonly string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= minTermLength);
}

/**
 * Lowercased haystack for a recipe — id + description + domain + every
 * intent surface, joined with a single space. Tokens substring-matched
 * against this string for the text-term signal.
 */
function recipeHaystack(recipe: Recipe): string {
  const parts: string[] = [recipe.id, recipe.description];
  if (recipe.domain) parts.push(recipe.domain);
  if (recipe.intent_surfaces) parts.push(...recipe.intent_surfaces);
  return parts.join(' ').toLowerCase();
}

export class SubstringRecipeResolver implements RecipeResolver {
  readonly id: string;
  readonly #minTermLength: number;
  #recipes: readonly Recipe[] = [];

  constructor(opts: SubstringRecipeResolverOptions = {}) {
    this.id = opts.id ?? 'substring';
    this.#minTermLength = Math.max(1, opts.minTermLength ?? 2);
  }

  // The substring resolver does not actually await anything; the async
  // signature exists to satisfy `RecipeResolver` (the embedding variant
  // unavoidably awaits its embedding client).
  // eslint-disable-next-line @typescript-eslint/require-await
  async index(recipes: readonly Recipe[]): Promise<void> {
    this.#recipes = recipes.slice();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async resolve(query: RecipeQuery): Promise<RecipeResolverResult> {
    return this.scoreSync(query);
  }

  /**
   * Synchronous score helper. Public for the embedding resolver's
   * brand-fit re-ranking stage and for callers that want the score
   * computation without the `Promise` ceremony. Never throws.
   */
  scoreSync(query: RecipeQuery): RecipeResolverResult {
    const topN = query.topN ?? DEFAULT_TOP_N;
    if (topN <= 0 || this.#recipes.length === 0) return { recipes: [], scores: [] };

    const text = (query.text ?? '').trim();
    const lowerText = text.toLowerCase();
    const terms = tokenize(text, this.#minTermLength);

    type Scored = { recipe: Recipe; score: number; idx: number };
    const scored: Scored[] = [];

    for (let idx = 0; idx < this.#recipes.length; idx++) {
      const recipe = this.#recipes[idx] as Recipe;
      const lowerId = recipe.id.toLowerCase();
      let score = 0;

      // 1. Exact id.
      if (text.length > 0 && lowerId === lowerText) {
        score += SCORE_EXACT_ID;
      } else if (text.length > 0 && lowerId.startsWith(lowerText)) {
        // 2. Prefix id (only when not exact).
        score += SCORE_PREFIX_ID;
      }

      // 3. Domain.
      if (
        query.domain !== undefined &&
        recipe.domain !== undefined &&
        recipe.domain.toLowerCase() === query.domain.toLowerCase()
      ) {
        score += SCORE_DOMAIN;
      }

      // 4. Text terms.
      if (terms.length > 0) {
        const haystack = recipeHaystack(recipe);
        let termHits = 0;
        for (const term of terms) {
          if (haystack.includes(term)) termHits += 1;
        }
        score += termHits * SCORE_TEXT_TERM;
      }

      // 5. Brand fit.
      if (
        query.brandKitId !== undefined &&
        recipe.brand_kit_id !== undefined &&
        recipe.brand_kit_id === query.brandKitId
      ) {
        score += SCORE_BRAND;
      }

      if (score > 0) scored.push({ recipe, score, idx });
    }

    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const top = scored.slice(0, topN);
    return {
      recipes: top.map((s) => s.recipe),
      scores: top.map((s) => s.score),
    };
  }

  /** Number of recipes currently indexed. Test seam + diagnostics. */
  size(): number {
    return this.#recipes.length;
  }
}
