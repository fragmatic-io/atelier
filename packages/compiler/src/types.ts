// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Public types for `@cir/compiler`.
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
  Capability,
  ComponentDefinition,
  IntentProfile,
  Manifest,
  Skill,
  BrandKit,
  Trigger,
} from '@cir/schemas';

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
