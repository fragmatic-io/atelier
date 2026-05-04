// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `ToolEnvironment` — the host-supplied context that backs the C-2 tool-using
 * compiler. The tool surface (see `tool-using-compiler.ts`) translates each
 * agent function call into a thin lookup on this bag.
 *
 * The environment is intentionally pure-data: a record of capabilities, a
 * list of components, plus optional host hooks for validation and existing-
 * manifest awareness. The compiler does NOT reach into runtime services or
 * the network — every tool is a synchronous (or quickly resolvable) read so
 * the agent loop bounds end-to-end latency.
 *
 * ## Why a separate seam from `CompileInput.{capabilities,components}`?
 *
 * The cold prompt today stuffs every capability schema and every component
 * description into the user message. With C-2 the LLM does NOT need
 * everything in the prompt — it asks for what it needs via tools. The
 * environment is the corpus the tools search; `CompileInput` still carries
 * the same fields (back-compat) but they're surfaced on demand instead of
 * up front.
 *
 * Hosts wire the environment when constructing the wrapper:
 *
 *   new ToolUsingCompiler({
 *     inner: new GeminiCompiler({ apiKey, ... }),
 *     env: {
 *       capabilities: CAPABILITIES,
 *       components: COMPONENT_CATALOG,
 *       validate: validateManifestSemantics,
 *       inspectExistingManifest: (route) => store.peek(route),
 *       listSiblingRoutes: () => listRoutes(),
 *     },
 *     search: { capabilities: ragLookup, components: vectorSearch },
 *   });
 *
 * ## Search seam (C-5 RAG)
 *
 * `findCapability` and `findComponent` fall back to substring matching when
 * no `SemanticSearch` is supplied. C-5 swaps in vector-indexed semantic
 * search without changing the tool surface — the wrapper still calls
 * `search.capabilities(query, k)`; the implementation evolves underneath.
 */

import type { Capability, ComponentDefinition, IntentProfile, Manifest } from '@atelier/schemas';

/**
 * Result shape for `validateDraft`. Same `{ ok, reasons }` shape used by
 * `ValidationFeedbackCompiler` so hosts can re-use a single validator
 * function across the stack.
 */
export interface ToolValidationResult {
  ok: boolean;
  reasons?: readonly string[];
}

/**
 * Lightweight outline of a sibling route. Used by `listSiblingRoutes` to
 * give the agent cross-route consistency context (e.g. "another route in
 * this app already renders the chrome with `<Stack(Logo, NavBar)>`; mirror
 * the pattern").
 */
export interface RouteOutline {
  path: string;
  title?: string;
  /** Optional one-line summary of what the route renders. */
  summary?: string;
}

/**
 * The host-supplied bag of pure-data lookups. Every tool the agent calls
 * resolves through one of these fields.
 *
 * `validate` is required by `ToolUsingCompiler`'s default production mode.
 * The agent must call `validateDraft`, receive a passing result, and then emit
 * that same draft as the final manifest. Optional introspection hooks
 * (`inspectExistingManifest`, `listSiblingRoutes`) still degrade gracefully
 * when not supplied.
 */
export interface ToolEnvironment {
  /** Capabilities the agent may reference. Keyed by `Capability.id`. */
  capabilities: Record<string, Capability>;
  /** Components the agent may compose. Each carries `id` + description. */
  components: ComponentDefinition[];
  /**
   * Policy/composition validator for production compiler paths. When the
   * agent calls `validateDraft`, this hook gates the answer. Returning
   * `{ ok: false, reasons: [...] }` lets the agent self-correct before
   * declaring its final answer.
   */
  validate?: (draft: Manifest) => ToolValidationResult;
  /**
   * Optional accessor for the manifest currently rendered for a route.
   * Used by `inspectExistingManifest` so diff-mode compiles can ask "what
   * is there now?" without the host pre-bundling every previous manifest
   * into `CompileInput.previousManifest`.
   */
  inspectExistingManifest?: (route: string) => Manifest | null;
  /**
   * Optional accessor for sibling routes. Returns a brief outline of each
   * other route in the app so the agent can keep chrome and brand
   * consistent across routes without compiling every sibling itself.
   */
  listSiblingRoutes?: () => readonly RouteOutline[];
  /**
   * Optional recipe resolver — the C-5 RAG seam. When supplied, the
   * agent's `findRecipe` tool routes through this resolver; otherwise
   * the tool returns `{ recipes: [] }`. The structural shape mirrors
   * `@atelier/recipe-resolver`'s `RecipeResolver` so hosts can pass
   * either implementation directly without an adapter (the compiler
   * package does not take a hard dep on `@atelier/recipe-resolver`).
   */
  recipeResolver?: RecipeResolverLike;
}

/**
 * Structural recipe — what the compiler needs from a recipe to project
 * the slim view to the agent. Hosts pass instances of
 * `@atelier/recipe-resolver`'s `Recipe` (or any equivalent shape).
 */
export interface RecipeLike {
  readonly id: string;
  readonly description: string;
  readonly domain?: string;
  readonly brand_kit_id?: string;
  readonly intent_surfaces?: readonly string[];
  readonly manifest?: unknown;
}

/**
 * Structural query — the seam the compiler tool builds from the agent's
 * `findRecipe(query, topN)` call. Mirrors `@atelier/recipe-resolver`'s
 * `RecipeQuery` shape.
 */
export interface RecipeQueryLike {
  routeId?: string;
  intent?: IntentProfile;
  brandKitId?: string;
  domain?: string;
  text?: string;
  topN?: number;
}

export interface RecipeResolverResultLike {
  recipes: readonly RecipeLike[];
  scores?: readonly number[];
}

/**
 * Structural resolver. The compiler tool only needs `resolve(...)`;
 * `index(...)` is a host-side concern and not surfaced through the
 * agent. Implementations that ship `index` (the standard ones) satisfy
 * this type by structural subtyping.
 */
export interface RecipeResolverLike {
  resolve(query: RecipeQueryLike): Promise<RecipeResolverResultLike>;
}

/**
 * Slim projection returned by the `findRecipe` tool — id + description +
 * brand_kit_id + intent_surfaces. Deliberately drops the (potentially
 * large) `manifest` field so the agent's context budget stays small.
 * Hosts that want the full recipe call `RecipeStore.get(id)` server-side
 * after the agent picks a candidate.
 */
export interface SlimRecipe {
  id: string;
  description: string;
  brand_kit_id?: string;
  intent_surfaces?: readonly string[];
  domain?: string;
}

/**
 * Result the `findRecipe` tool returns to the agent. Same shape as
 * `RecipeResolverResultLike` but with `recipes` projected to
 * `SlimRecipe`.
 */
export interface FindRecipeResult {
  recipes: SlimRecipe[];
  scores?: readonly number[];
}

/**
 * Pure-function projection. Public for tests + custom tool surfaces;
 * the wrapper uses it internally. Drops `manifest` outright; everything
 * else passes through unchanged.
 */
export function slimRecipe(recipe: RecipeLike): SlimRecipe {
  return {
    id: recipe.id,
    description: recipe.description,
    ...(recipe.domain !== undefined ? { domain: recipe.domain } : {}),
    ...(recipe.brand_kit_id !== undefined ? { brand_kit_id: recipe.brand_kit_id } : {}),
    ...(recipe.intent_surfaces !== undefined ? { intent_surfaces: recipe.intent_surfaces } : {}),
  };
}

/**
 * A capability reference — id + description, sufficient for the agent to
 * decide whether to fetch the full schema via `lookupCapability`. Returned
 * from `findCapability` / `listCapabilities`.
 */
export interface CapabilityRef {
  id: string;
  description?: string;
}

/**
 * Optional semantic-search seam. C-5 RAG fills these with vector-indexed
 * lookups; today's commit ships substring-fallback inside the wrapper so
 * the tools work out of the box on any host.
 */
export interface SemanticSearch {
  /** Search capabilities by intent string. Returns up to `k` matches. */
  capabilities?: (query: string, k: number) => readonly CapabilityRef[];
  /**
   * Search components by intent string (typically `"<role> <intent>"`).
   * Returns up to `k` matches.
   */
  components?: (query: string, k: number) => readonly ComponentDefinition[];
}

/**
 * Token a query into lowercase whitespace-separated terms. Empty terms
 * filtered out so a trailing space does not match every entry.
 */
function tokenize(query: string): readonly string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Substring-fallback search across capability id + description. Public for
 * tests; `ToolUsingCompiler` uses it when no `SemanticSearch.capabilities`
 * is supplied. Each whitespace-separated term is searched independently;
 * a capability matches when ANY term substring-matches its id or
 * description (any-of, OR semantics — typical for naive RAG fallbacks).
 */
export function fallbackFindCapability(
  capabilities: Readonly<Record<string, Capability>>,
  query: string,
  k: number,
): readonly CapabilityRef[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const out: CapabilityRef[] = [];
  for (const [id, cap] of Object.entries(capabilities)) {
    if (out.length >= k) break;
    const lowerId = id.toLowerCase();
    const desc = (cap as { description?: string }).description ?? '';
    const lowerDesc = desc.toLowerCase();
    if (terms.some((t) => lowerId.includes(t) || lowerDesc.includes(t))) {
      out.push(desc.length > 0 ? { id, description: desc } : { id });
    }
  }
  return out;
}

/**
 * Substring-fallback search across component id + description. Public for
 * tests; `ToolUsingCompiler` uses it when no `SemanticSearch.components`
 * is supplied. Same any-of-terms semantics as `fallbackFindCapability`.
 * The query is a free-form string ("role intent") because
 * `findComponent(role, intent)` concatenates the two for the search.
 */
export function fallbackFindComponent(
  components: readonly ComponentDefinition[],
  query: string,
  k: number,
): readonly ComponentDefinition[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const out: ComponentDefinition[] = [];
  for (const c of components) {
    if (out.length >= k) break;
    const id = ((c as { id?: string }).id ?? '').toLowerCase();
    const desc = ((c as { description?: string }).description ?? '').toLowerCase();
    if (terms.some((t) => id.includes(t) || desc.includes(t))) {
      out.push(c);
    }
  }
  return out;
}
