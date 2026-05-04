// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Public types for `@atelier/compiler`.
 *
 * The compiler is the only LLM-touching component in the hot system. Its job
 * is to turn `(capabilities + skills + components + intent + brand kit +
 * trigger)` into a validated `Manifest`. The runtime depends only on the
 * `CompilerService` interface here; concrete implementations (`GeminiCompiler`,
 * `FallbackCompiler`, `CompositeCompiler`) live alongside.
 *
 * Caching is intentionally NOT in the compiler's contract — that's the
 * `ManifestStore`'s job. A compiler call is always a fresh compute; the
 * resolver decides when to call.
 */

import type {
  AppOutline,
  Capability,
  ComponentDefinition,
  IntentProfile,
  Manifest,
  Skill,
  BrandKit,
  Trigger,
} from '@atelier/schemas';

export interface CompileInput {
  /** The user this manifest is for. Used for audit and per-user caching. */
  user_id: string;
  /** The app this manifest belongs to. */
  app_id: string;
  /** The route to compile (e.g. "/today"). */
  route: string;
  /**
   * Capabilities available for the compiler to reference. Should already be
   * filtered by the resolver to those relevant to this route.
   */
  capabilities: Record<string, Capability>;
  /** Skills the compiler may use for usage knowledge. Optional. */
  skills?: Record<string, Skill>;
  /**
   * Components available for the compiler to reference (registry summary).
   * Includes composition rules implicitly through the `can_contain` field.
   */
  components: ComponentDefinition[];
  /** Scoped intent slice for this user. Optional but typical. */
  intent?: IntentProfile;
  /**
   * Design system contract. Folded into the system prompt so generated
   * manifests use only on-brand values. The runtime's `respects_brand_kit`
   * policy enforces this as a hard contract.
   */
  brandKit?: BrandKit;
  /**
   * The trigger that caused this compile. Empty/undefined means a cold
   * compile (first-ever request). Used in the prompt to give the LLM
   * context: "the user just switched lens" vs. "the capability schema bumped".
   */
  trigger?: Trigger;
  /**
   * Previous manifest for the same key, if any. Compilers in diff mode use
   * this to produce only the changes (~80% token saving per
   * docs/architecture.md).
   */
  previousManifest?: Manifest;
  /** Hard deadline; compiler aborts if exceeded. */
  signal?: AbortSignal;
  /**
   * Optional concrete few-shot example. The framework's system prompt
   * supplies structural guidance ("header → container → stack [heading,
   * subtitle, data-bound rich binding, ambient affordances]"), but the
   * LLM benefits from a concrete grounding example in the *host's* own
   * catalog vocabulary. Each app supplies one (typically the most
   * representative route's hand-written manifest from its
   * `manifestForRoute` fallback) so the LLM mirrors the right patterns.
   *
   * Without this, the framework falls back to a generic baseline-only
   * structure template — which works but produces less-rich output.
   *
   * Per `docs/ethos.md`: prompts are framework-level; concrete examples
   * are per-host.
   */
  fewShotExample?: Manifest;
  /**
   * Wave C / Phase C-1 — refinement input.
   *
   * When a wrapping `ValidationFeedbackCompiler` is retrying after policy
   * validation rejected a previous attempt, it threads the rejected
   * manifest back through `CompileInput.priorDraft` so the inner compiler
   * can inspect what it produced. Pair with `violations` (below) which
   * carries the human-readable list of policy reasons that fired against
   * `priorDraft`.
   *
   * The prompt builder folds these into a "Previous attempt" + "Fix the
   * violations" section so the LLM sees its own draft alongside the
   * exact failure list — a much higher-quality retry signal than the
   * single-pass cold prompt or the existing in-`GeminiCompiler`
   * one-retry path that only carries the error message text.
   *
   * Compilers that don't understand refinement mode are free to ignore
   * these fields — they degrade to a normal cold compile.
   */
  priorDraft?: Manifest | undefined;
  /**
   * Wave C / Phase C-1 — human-readable policy violations from the
   * previous attempt. See `priorDraft` for the full contract; the two
   * fields are always set together by `ValidationFeedbackCompiler`.
   */
  violations?: readonly string[] | undefined;
  /**
   * Wave C / Phase C-4 — app-wide outline produced by the once-per-app
   * pre-pass. When set, the inner compiler may render only the route's
   * content area (chrome / nav / common policies / skill stack are
   * supplied here). Threaded by `MultiRouteCompiler`; compilers that
   * don't read it degrade to standalone behaviour with no change.
   */
  outline?: AppOutline | undefined;
  /**
   * Wave C / Phase C-3 — capability scoping resolver.
   *
   * When set, the compiler invokes the resolver BEFORE prompt assembly to
   * narrow `capabilities` from the full registry (potentially 200+ entries)
   * to the top-N most relevant for this route + intent. Only the narrowed
   * subset is stuffed into the system prompt; the agent's tool surface
   * (`lookupCapability` / `listCapabilities`) still sees the full registry
   * so the LLM can broaden when needed.
   *
   * Compilers that don't read this field degrade gracefully — the scoping
   * is purely an optimisation and the full registry compile path remains
   * the default.
   *
   * The interface here is structural to avoid a hard package dep on
   * `@atelier/capability-resolver`; both `CapabilityResolver` (`resolve()`
   * shape) and `LegacyCapabilityResolver` (`scope()` shape) match.
   */
  capabilityResolver?: CompileCapabilityResolver | undefined;
  /**
   * Wave C / Phase C-3 — top-N hint for the resolver. Defaults to 30 (a
   * safe budget for ~150kB of capability schemas). Hosts wiring a known
   * tighter or looser scope override here.
   */
  topN?: number | undefined;
}

/**
 * Wave C / Phase C-3 — minimal structural type the compiler relies on
 * when a `capabilityResolver` is supplied on `CompileInput`. The full
 * `CapabilityResolver` interface lives in `@atelier/capability-resolver`;
 * this is the subset the compiler integration touches, declared here to
 * keep the compiler package free of a hard dep on the resolver package.
 *
 * Implementations:
 *   - The high-level `resolve(query)` shape — typical for new code.
 *   - The lower-level `scope(request, k, registry)` shape — what the
 *     resolver package shipped with Wave 10 / S-1. The compiler accepts
 *     either; `scope` is preferred when present (it carries route + user
 *     context to the underlying tiny model).
 */
export interface CompileCapabilityResolver {
  readonly id?: string;
  /**
   * High-level resolver entry-point. Returns up to `query.topN`
   * capabilities ranked by relevance to `query.text` / `query.intent`.
   */
  resolve?(query: ResolverQuery): Promise<ResolverResult>;
  /**
   * Lower-level entry-point matching `@atelier/capability-resolver`'s
   * `CapabilityResolver.scope`. Returns refs (id + description) the
   * compiler maps back into its `capabilities` registry.
   */
  scope?(
    request: { intent: string; route: string; userId: string; appId: string; signal?: AbortSignal },
    k: number,
    registry: Readonly<Record<string, Capability>>,
  ): Promise<readonly { id: string; description?: string }[]>;
}

/**
 * Wave C / Phase C-3 — query shape for the high-level
 * `CapabilityResolver.resolve()` surface. All fields optional so simple
 * callers (tests, ad-hoc tooling) can pass `{ text }` and let defaults
 * handle the rest.
 */
export interface ResolverQuery {
  /** Route id being compiled (e.g. "/today"). */
  routeId?: string;
  /** Intent profile snapshot — additional signal for the resolver. */
  intent?: IntentProfile;
  /** Free-text query — typically the route's intent surface description. */
  text?: string;
  /** Top-N to return. Defaults to 30 if unset. */
  topN?: number;
  /** Optional abort signal (forwarded to the underlying client). */
  signal?: AbortSignal;
}

/**
 * Wave C / Phase C-3 — result shape for `CapabilityResolver.resolve()`.
 * `scores` is an optional debug channel; hosts wiring observability
 * record it alongside the picked ids.
 */
export interface ResolverResult {
  capabilities: readonly Capability[];
  scores?: readonly number[];
}

export interface CompileResult {
  manifest: Manifest;
  /** Total tokens consumed (prompt + response). 0 for non-LLM compilers. */
  token_cost: number;
  /** Wall-clock duration of the compile call. */
  duration_ms: number;
  /** Identifier of the model that produced this output. */
  model: string;
  /** True if the compiler ran in diff-mode (had a previousManifest). */
  diff_mode: boolean;
  /** Free-form explanation of what changed; used in audit events. */
  reasoning?: string;
}

/**
 * The compile contract. Implementations: `GeminiCompiler` (LLM-backed),
 * `FallbackCompiler` (hand-written manifests for offline / quota-exceeded
 * scenarios), `CompositeCompiler` (try primary, fall back on error).
 */
export interface CompilerService {
  /**
   * Stable identifier for this compiler — e.g. "gemini-2.5-pro",
   * "fallback", "composite[gemini-2.5-pro,fallback]". Recorded in
   * audit events as `compiler_model`.
   */
  readonly id: string;
  compile(input: CompileInput): Promise<CompileResult>;
}

/**
 * Raised when the compiler's response cannot be coerced into a valid
 * `Manifest` after retry. Callers (typically `CompositeCompiler`) catch
 * this and try a fallback.
 */
export class CompilerOutputError extends Error {
  constructor(
    message: string,
    readonly cause_detail: unknown,
  ) {
    super(message);
    this.name = 'CompilerOutputError';
  }
}

/** Raised when the compiler is unavailable (no key, network down, etc.). */
export class CompilerUnavailableError extends Error {
  constructor(
    message: string,
    readonly cause_detail?: unknown,
  ) {
    super(message);
    this.name = 'CompilerUnavailableError';
  }
}

/**
 * Raised when a wrapped compile is blocked by a `BudgetMeter` and the
 * configured `on_exhausted` policy is `'fail'`. Distinct from
 * `BudgetExceededError` (the resolver-level guard against per-user daily
 * token spend in `ServerManifestResolver`); this one is raised at the
 * compiler layer, before any LLM call, by the in-process meter.
 */
export class CompilerBudgetExhaustedError extends Error {
  constructor(
    message: string,
    /** Why the meter blocked (e.g. `"token cap exhausted"`). */
    readonly reason: string,
  ) {
    super(message);
    this.name = 'CompilerBudgetExhaustedError';
  }
}
