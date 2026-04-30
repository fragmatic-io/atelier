// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `@cir/compiler` — public surface.
 *
 * The compiler service translates `(capabilities + skills + components +
 * intent + brand kit + trigger)` into a validated `Manifest`. Caching is
 * done by `ManifestStore` (Tier 3); orchestration by `ServerManifestResolver`.
 *
 * Typical wire-up in a Next.js route handler:
 *
 *   import {
 *     CompositeCompiler, GeminiCompiler, FallbackCompiler,
 *     MemoryManifestStore, ServerManifestResolver,
 *   } from '@cir/compiler';
 *
 *   const compiler = new CompositeCompiler([
 *     new GeminiCompiler({ apiKey: process.env.GEMINI_API_KEY! }),
 *     new FallbackCompiler({ lookup: manifestForRoute }),
 *   ]);
 *   const store = new MemoryManifestStore();
 *   const resolver = new ServerManifestResolver({ compiler, store });
 *
 * See `/Users/vid/cir/docs/architecture.md` §"Compiler service in detail"
 * for the prompt structure and the diff-mode contract.
 */

// Core types
export {
  CompilerOutputError,
  CompilerUnavailableError,
  type CompileInput,
  type CompileResult,
  type CompilerService,
} from './types.js';

// Compilers
export { GeminiCompiler, type GeminiCompilerOptions } from './gemini-compiler.js';
export { FallbackCompiler, type FallbackCompilerOptions } from './fallback-compiler.js';
export { CompositeCompiler, type CompositeCompilerOptions } from './composite-compiler.js';

// Intent profile compiler (onboarding)
export {
  CompositeIntentProfileCompiler,
  FallbackIntentProfileCompiler,
  GeminiIntentProfileCompiler,
  type CompileIntentProfileInput,
  type CompileIntentProfileResult,
  type CompositeIntentProfileCompilerOptions,
  type FallbackIntentProfileCompilerOptions,
  type GeminiIntentProfileCompilerOptions,
  type IntentProfileCompileOptions,
  type IntentProfileCompilerService,
} from './intent-profile-compiler.js';

// Tier-3 cache
export {
  MemoryManifestStore,
  type ManifestStore,
  type ManifestStoreKey,
  type ManifestStoreStats,
  type MemoryManifestStoreOptions,
  type StoredManifest,
} from './manifest-store.js';
export { RedisManifestStore, type RedisManifestStoreOptions } from './redis-manifest-store.js';

// Resolver
export {
  BudgetExceededError,
  ServerManifestResolver,
  type ResolveResult,
  type ServerAuditEmitter,
  type ServerManifestResolverOptions,
  type TokenBudgetCounter,
} from './server-resolver.js';

// Prompts (exported for tests / custom compilers / observability)
export { COMPILER_SYSTEM_PROMPT, COMPILER_SYSTEM_PROMPT_VERSION } from './prompts/system.js';
export { buildPromptContext, type BuiltPromptContext } from './prompts/builder.js';
export {
  buildIntentProfilePrompt,
  INTENT_PROFILE_SYSTEM_PROMPT,
  INTENT_PROFILE_SYSTEM_PROMPT_VERSION,
  type IntentProfilePromptInput,
  type IntentProfilePromptResult,
} from './prompts/intent-profile-builder.js';
