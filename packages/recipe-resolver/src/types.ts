// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `RecipeResolver` — abstract retrieval interface for Wave C / Phase C-5.
 *
 * The resolver answers a single question: **given a free-form query (route +
 * intent + brand-fit + domain hint + text), which recipes most closely
 * match?** The answer is a bounded list (`topN`, default 5) that the C-2
 * `ToolUsingCompiler` consumes through its new `findRecipe` tool — so the
 * compiler agent can ground its compose step on a known persona scaffold
 * before drafting the final manifest.
 *
 * Two implementations ship in this package:
 *
 *   - `SubstringRecipeResolver` — fast, free, no LLM. Exact id / prefix /
 *     substring match across description / domain / brand. Baseline +
 *     fallback for the embedding variant.
 *   - `EmbeddingRecipeResolver` — embeddings over the recipe's
 *     description + domain + intent surface texts; brand-fit acts as a
 *     re-ranking signal. Substring fallback on embedding failure.
 *
 * Recipes are loaded via a host-supplied `RecipeStore` so the package
 * doesn't bake in a filesystem / HTTP loader. `LocalRecipeStore` is
 * shipped for the in-tree `apps/demo` recipes; V-6 will swap in a
 * marketplace-backed `RecipeStore` without changing callers.
 *
 * The interface is the same shape as `@atelier/capability-resolver`'s
 * `CapabilityResolver` (different corpus, different signals) so the two
 * RAG stories rhyme — a host that wires one wires the other almost the
 * same way.
 */

import type { IntentProfile } from '@atelier/schemas';

/**
 * A recipe — persona-tuned manifest scaffold the compiler agent can use
 * as a starting point. The package treats recipes as opaque blobs with a
 * thin metadata surface; we don't validate the manifest body here (the
 * compiler does that downstream when it actually compiles).
 *
 *   - `id` — stable id (e.g. `"github-reviewer"`, `"dummyjson-shopper"`).
 *   - `description` — one-line human description; the embedding signal.
 *   - `domain` — optional domain tag (`"commerce"`, `"issue-tracker"`...).
 *   - `brand_kit_id` — optional brand-fit signal. Recipes tied to a brand
 *     rank higher when the query carries that brand.
 *   - `intent_surfaces` — short strings describing what the recipe
 *     surfaces (e.g. `["browse products", "cart", "checkout"]`). Mixed
 *     into the embedding text so a query about checkout finds the
 *     shopping recipe.
 *   - `manifest` — opaque manifest payload. The agent sees the slim
 *     projection through `findRecipe`; the full manifest is only loaded
 *     when the host explicitly fetches it via `RecipeStore.get`.
 */
export interface Recipe {
  /** Stable id. Used as the sole identity in scores + caches. */
  readonly id: string;
  /** Human-readable description; primary embedding signal. */
  readonly description: string;
  /** Optional domain hint. */
  readonly domain?: string;
  /** Optional brand-fit signal. */
  readonly brand_kit_id?: string;
  /** Surface texts describing what routes/intents the recipe covers. */
  readonly intent_surfaces?: readonly string[];
  /** Opaque manifest body — the package does not validate it. */
  readonly manifest?: unknown;
}

/**
 * Query for `RecipeResolver.resolve`. Every field is optional — the
 * resolver does its best with whatever signals are present; an empty
 * query returns `[]` rather than panicking.
 */
export interface RecipeQuery {
  /** Optional route being compiled (used as a routing hint by some hosts). */
  routeId?: string;
  /** Optional intent profile carrying preferences/personas. */
  intent?: IntentProfile;
  /** Optional brand-fit signal. */
  brandKitId?: string;
  /** Optional domain hint. */
  domain?: string;
  /** Free-form description. */
  text?: string;
  /** Max results to return. Defaults to `DEFAULT_TOP_N`. */
  topN?: number;
}

/**
 * Result of a `resolve` call. `scores` is optional — the substring
 * resolver fills it in (term-overlap counts), the embedding resolver
 * fills it in (cosine similarities). When present it is parallel to
 * `recipes` so callers can show ranking confidence.
 */
export interface RecipeResolverResult {
  recipes: Recipe[];
  scores?: number[];
}

/**
 * The resolver-facing contract. Hosts wire one resolver and point the
 * compiler at it via `ToolEnvironment.recipeResolver`.
 *
 * Implementations are responsible for:
 *   - Returning a list of `Recipe`s drawn from the index. The list MAY be
 *     smaller than `topN` when the implementation can't justify more.
 *   - `index(recipes)` is idempotent. Hosts may rebuild the index on
 *     publish events or on a schedule; resolver state MUST be replaced
 *     atomically per call (no half-built state survives a failure).
 *   - Falling back gracefully on any error. The substring resolver is
 *     allergic to throwing; the embedding resolver MUST cascade to a
 *     secondary `RecipeResolver` (typically the substring one) on
 *     embedding-client failure or empty index, rather than failing the
 *     whole compile.
 */
export interface RecipeResolver {
  /**
   * Stable identifier surfaced in audit / logs. Conventionally
   * `'<implementation>[<hint>]'` — e.g. `'embedding[openai/text-embedding-3-small]'`.
   */
  readonly id: string;
  /** Run a single retrieval. */
  resolve(query: RecipeQuery): Promise<RecipeResolverResult>;
  /**
   * Build / rebuild the index from `recipes`. Implementations replace
   * any prior state. The substring resolver does this in O(n); the
   * embedding resolver does this in O(n * embed-call) — typically batched.
   */
  index(recipes: readonly Recipe[]): Promise<void>;
}

/**
 * Host-supplied recipe loader. Keeps the resolver decoupled from where
 * recipes physically live — a `LocalRecipeStore` reads from disk; a
 * marketplace-backed store fetches from a registry. The compiler tool
 * uses `list()` to seed the resolver's index; `get(id)` is exposed for
 * hosts that want to fetch the full manifest after the agent picks a
 * candidate (the `findRecipe` tool itself only returns the slim
 * projection — see `tool-environment.ts`).
 */
export interface RecipeStore {
  /** Return every recipe known to this store. */
  list(): Promise<readonly Recipe[]>;
  /** Return a recipe by id, or `null` if not found. */
  get(id: string): Promise<Recipe | null>;
}

/**
 * Default top-N used when callers don't pass an explicit `topN`. The
 * `findRecipe` tool surfaces a `topN` arg with `default: 5`; resolvers
 * default to the same so callers without a tool layer get the same
 * behaviour.
 */
export const DEFAULT_TOP_N = 5;
