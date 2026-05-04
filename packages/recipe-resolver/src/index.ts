// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/recipe-resolver` — public surface for Wave C / Phase C-5.
 *
 * Recipe retrieval (RAG) for the C-2 `ToolUsingCompiler`. The package
 * ships:
 *
 *   - `RecipeResolver` — abstract retrieval contract.
 *   - `SubstringRecipeResolver` — fast/free baseline (exact + prefix +
 *     substring + brand-id match).
 *   - `EmbeddingRecipeResolver` — production. Embeddings over the
 *     recipe's description + domain + intent surface texts; brand-fit
 *     re-ranking; substring fallback on embedding failure.
 *   - `LocalRecipeStore` — file-system-backed `RecipeStore` for the
 *     in-tree `recipes/` directory. V-6's marketplace store will swap
 *     in when it ships.
 *
 * Typical wire-up:
 *
 *   import {
 *     EmbeddingRecipeResolver,
 *     LocalRecipeStore,
 *   } from '@atelier/recipe-resolver';
 *
 *   const store = new LocalRecipeStore({ directory: '/path/to/recipes' });
 *   const resolver = new EmbeddingRecipeResolver({ client: openaiEmbeddings });
 *   await resolver.index(await store.list());
 *
 *   const compiler = new ToolUsingCompiler({
 *     inner: geminiAgentClient,
 *     env: { capabilities, components, recipeResolver: resolver },
 *   });
 *
 * The compiler agent calls the new `findRecipe` tool, which routes
 * through the resolver. See the C-5 doc page for the full story.
 */

export {
  DEFAULT_TOP_N,
  type Recipe,
  type RecipeQuery,
  type RecipeResolver,
  type RecipeResolverResult,
  type RecipeStore,
} from './types.js';

export {
  SubstringRecipeResolver,
  type SubstringRecipeResolverOptions,
} from './substring-resolver.js';

export {
  EmbeddingRecipeResolver,
  MemoryEmbeddingResolverCache,
  queryEmbeddingText,
  recipeEmbeddingText,
  type EmbeddingErrorObserver,
  type EmbeddingRecipeResolverOptions,
  type EmbeddingResolveObserver,
  type EmbeddingResolverCache,
} from './embedding-resolver.js';

export {
  InMemoryEmbeddingIndex,
  cosineSimilarity,
  type EmbeddingClient,
  type EmbeddingEntry,
  type EmbeddingIndex,
  type InMemoryEmbeddingIndexOptions,
} from './embedding-index.js';

export { LocalRecipeStore, type LocalRecipeStoreOptions } from './local-recipe-store.js';
