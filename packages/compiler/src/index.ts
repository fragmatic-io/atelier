// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/compiler` — public surface.
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
 *     createBaselineManifestValidator,
 *   } from '@atelier/compiler';
 *
 *   const compiler = new CompositeCompiler([
 *     new GeminiCompiler({ apiKey: process.env.GEMINI_API_KEY! }),
 *     new FallbackCompiler({ lookup: manifestForRoute }),
 *   ]);
 *   const store = new MemoryManifestStore();
 *   const resolver = new ServerManifestResolver({
 *     compiler,
 *     store,
 *     validate: createBaselineManifestValidator({ grantedFields: [] }),
 *   });
 *
 * ## Compile cost budgets (Wave 10 S-6)
 *
 * For commercial deployments, wrap each LLM-backed child compiler in a
 * `BudgetMeteredCompiler` so per-user spend is bounded. The wrapper reads
 * the budget from `IntentProfile.compile_budget` and/or
 * `BrandKit.compile_budget` (host wires it explicitly — see
 * `mergeCompileBudgets` for the stricter-wins merge).
 *
 *   import {
 *     CompositeCompiler, GeminiCompiler, GenericFallbackCompiler,
 *     BudgetMeteredCompiler, InMemoryBudgetCounter, mergeCompileBudgets,
 *   } from '@atelier/compiler';
 *
 *   const counter = new InMemoryBudgetCounter();   // dev; Redis in prod
 *   const budget = mergeCompileBudgets(
 *     intent.compile_budget,
 *     brandKit.compile_budget,
 *   );
 *
 *   const gemini = new GeminiCompiler({ apiKey: process.env.GEMINI_API_KEY! });
 *   const meteredGemini = budget
 *     ? new BudgetMeteredCompiler({ inner: gemini, counter, budget,
 *         onExceeded: (r) => console.warn('[budget]', r) })
 *     : gemini;
 *
 *   const compiler = new CompositeCompiler(
 *     [meteredGemini, new GenericFallbackCompiler()],
 *     { onCascade: (from, err) => console.warn('cascade', from, err) },
 *   );
 *
 * When the metered Gemini compiler throws `BudgetExceededError` (because
 * the user has hit their cap), `CompositeCompiler` catches it and advances
 * to `GenericFallbackCompiler`. The resolver's existing audit pipeline
 * records `manifest.compiled` with `compiler_model: 'fallback-generic'`,
 * which is the dashboard's signal that the LLM tier was skipped due to
 * budget. No new audit event is needed.
 *
 * The fallback path is intentional: a budget-exhausted user still sees an
 * app (just one rendered by the deterministic compiler). Hosts that want
 * to surface "you've hit your limit" instead can set
 * `compile_budget.on_exhausted = 'fail'` on the intent profile, which
 * elevates the breach to `CompilerBudgetExhaustedError` at the composite
 * level. `BudgetMeteredCompiler` itself always throws `BudgetExceededError`
 * — the `on_exhausted` policy is enforced one layer up by
 * `CompositeCompiler` via its built-in `BudgetMeter` integration.
 *
 * ## Validation feedback loop (Wave C / Phase C-1)
 *
 * `ValidationFeedbackCompiler` wraps an LLM-backed inner compiler with a
 * bounded refinement loop. When the host's `validate(manifest)` hook
 * rejects a draft, the wrapper threads `{prior_draft, violations}` back
 * into a refinement-mode `CompileInput` and re-prompts the SAME inner
 * compiler — typically recovering ~70% of single-shot validation
 * failures before the composite cascades. Showcase wiring lives in
 * `apps/demo-github/lib/atelier-server.ts`:
 *
 *   const gemini = new GeminiCompiler({ apiKey, ... });   // no `validate`
 *   compilers.push(
 *     new ValidationFeedbackCompiler({
 *       inner: gemini,
 *       validate: validateManifestSemantics,   // {ok, reasons}
 *       maxRetries: 2,
 *       onRetry: (n, violations) => log.warn('attempt failed', n, violations),
 *     }),
 *   );
 *   compilers.push(new GenericFallbackCompiler());
 *
 * See `/Users/vid/cir/docs/architecture.md` §"Compiler service in detail"
 * for the prompt structure and the diff-mode contract; see
 * `/Users/vid/cir/docs/token-economics.md` for the cost model that
 * motivates per-user budgets.
 */

// Core types
export {
  CompilerBudgetExhaustedError,
  CompilerOutputError,
  CompilerUnavailableError,
  type CompileCapabilityResolver,
  type CompileInput,
  type CompileResult,
  type CompilerService,
  type ResolverQuery,
  type ResolverResult,
} from './types.js';

// Compilers
export { GeminiCompiler, type GeminiCompilerOptions } from './gemini-compiler.js';
export { FallbackCompiler, type FallbackCompilerOptions } from './fallback-compiler.js';
export { GenericFallbackCompiler, genericFallbackManifest } from './generic-fallback.js';
export {
  CompositeCompiler,
  type BudgetEventPayload,
  type BudgetExceededEventPayload,
  type BudgetUsedEventPayload,
  type CompositeCompilerOptions,
} from './composite-compiler.js';

// Budget metering (Wave 10 S-6)
export {
  BudgetMeter,
  BudgetMeteredCompiler,
  InMemoryBudgetCounter,
  mergeCompileBudgets,
  type BudgetCheckResult,
  type BudgetCounter,
  type BudgetExceededReason,
  type BudgetMeteredCompilerOptions,
  type BudgetMeterOptions,
  type BudgetState,
} from './budget-meter.js';

// Validation feedback loop (Wave C / Phase C-1)
export {
  ValidationFeedbackCompiler,
  type ValidationFeedbackCompilerOptions,
  type ValidationFeedbackValidateResult,
} from './validation-feedback-compiler.js';

// Tool-using compiler (Wave C / Phase C-2)
export {
  AGENT_SYSTEM_PROMPT,
  ToolUsingCompiler,
  buildAgentUserPrompt,
  type AgentClient,
  type AgentContent,
  type AgentToolCall,
  type AgentToolDeclaration,
  type AgentTurnRequest,
  type AgentTurnResponse,
  type ToolCallObserver,
  type ToolUsingCompilerOptions,
} from './tool-using-compiler.js';
export {
  fallbackFindCapability,
  fallbackFindComponent,
  slimRecipe,
  type CapabilityRef,
  type FindRecipeResult,
  type RecipeLike,
  type RecipeQueryLike,
  type RecipeResolverLike,
  type RecipeResolverResultLike,
  type RouteOutline,
  type SemanticSearch,
  type SlimRecipe,
  type ToolEnvironment,
  type ToolValidationResult,
} from './tool-environment.js';
export { GeminiAgentClient, type GeminiAgentClientOptions } from './gemini-agent-client.js';

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
  type BudgetExceededCode,
  type ManifestValidationResult,
  type ManifestValidator,
  type ResolveResult,
  type ServerAuditEmitter,
  type ServerManifestResolverOptions,
  type TokenBudgetCounter,
} from './server-resolver.js';
export {
  createBaselineManifestValidator,
  type BaselineManifestValidatorOptions,
} from './manifest-policy-validator.js';

// Outline compiler + multi-route fan-out (Wave C / Phase C-4)
export {
  DeterministicOutlineCompiler,
  type CompileOutlineInput,
  type OutlineCompiler,
  type OutlineRouteInput,
} from './outline-compiler.js';
export {
  MultiRouteCompiler,
  type MultiRouteCompileResult,
  type MultiRouteCompilerOptions,
  type MultiRouteEntry,
} from './multi-route-compiler.js';

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
