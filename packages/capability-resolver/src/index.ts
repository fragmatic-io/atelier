// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/capability-resolver` — public surface for Wave 10 / S-1 (also
 * Wave C / Phase C-3).
 *
 * Capability scoping for the C-2 `ToolUsingCompiler`. The package ships:
 *
 *   - `CapabilityResolver` — abstract scoping contract.
 *   - `SubstringCapabilityResolver` — fast/free baseline (the same logic
 *     `@atelier/compiler`'s `fallbackFindCapability` ships, but tunable +
 *     properly packaged).
 *   - `TwoStageCapabilityResolver` — production. Stage 1 calls a tiny
 *     model (Gemini Flash by default) for the top-K capability ids; the
 *     primary `ToolUsingCompiler` (Pro model) only sees those K.
 *   - `MemoryScopingCache` — in-memory cache for stage-1 results.
 *   - `semanticSearchFromResolver` / `semanticSearchFromLookup` — bridge
 *     functions exposing a resolver as `@atelier/compiler`'s `SemanticSearch`.
 *
 * Typical wire-up:
 *
 *   import {
 *     SubstringCapabilityResolver,
 *     TwoStageCapabilityResolver,
 *     semanticSearchFromResolver,
 *   } from '@atelier/capability-resolver';
 *
 *   const resolver = process.env.CIR_CAPABILITY_SCOPING_ENABLED === '1'
 *     ? new TwoStageCapabilityResolver({ client: geminiFlashScopingClient })
 *     : new SubstringCapabilityResolver();
 *
 *   const primed = semanticSearchFromResolver(resolver, {
 *     request: { userId, appId, route, intent: userIntent },
 *     registry: CAPABILITIES,
 *   });
 *   await primed.prime(userIntent, 30);
 *
 *   const compiler = new ToolUsingCompiler({
 *     inner: geminiAgentClient,
 *     env: { capabilities: CAPABILITIES, components, validate, ... },
 *     search: primed.search,
 *   });
 *
 * See the README for when to use which resolver and the cascade story.
 */

export {
  DEFAULT_SCOPING_K,
  type CapabilityRef,
  type CapabilityResolver,
  type ScopeRequest,
} from './types.js';

export {
  SubstringCapabilityResolver,
  type SubstringCapabilityResolverOptions,
} from './substring-resolver.js';

export {
  TwoStageCapabilityResolver,
  type ScopingLlmClient,
  type ScopingLlmRequest,
  type ScopingLlmResponse,
  type ScopingObserver,
  type StageOneFailureObserver,
  type RecordStageOneTokensHook,
  type TwoStageCapabilityResolverOptions,
} from './two-stage-resolver.js';

export {
  MemoryScopingCache,
  hashIntent,
  type MemoryScopingCacheOptions,
  type ScopingCache,
  type ScopingCacheEntry,
  type ScopingCacheKey,
} from './cache.js';

export {
  semanticSearchFromResolver,
  semanticSearchFromLookup,
  type PrimedSemanticSearch,
  type SemanticSearchFromResolverOptions,
} from './adapter.js';

export {
  InMemoryEmbeddingIndex,
  cosineSimilarity,
  type EmbeddingClient,
  type EmbeddingIndex,
  type InMemoryEmbeddingIndexOptions,
} from './embedding-index.js';

export {
  EmbeddingCapabilityResolver,
  type EmbeddingCapabilityResolverOptions,
  type EmbeddingErrorObserver,
  type EmbeddingScopeObserver,
} from './embedding-resolver.js';

export {
  wrapAsHighLevel,
  type HighLevelCapabilityResolver,
  type HighLevelQuery,
  type HighLevelResult,
} from './high-level-adapter.js';
