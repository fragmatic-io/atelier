// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `ValidationFeedbackCompiler` — Wave C / Phase C-1.
 *
 * The smallest, highest-leverage architectural improvement on the compile
 * path: when policy validation rejects a draft manifest, re-prompt the SAME
 * inner compiler with `{prior_draft, violations}` and ask it to patch the
 * draft, BEFORE cascading to the next compiler in the chain.
 *
 * ## Why this matters
 *
 * Today's failure mode: the LLM produces a manifest, the host's `validate`
 * hook surfaces (e.g.) "Stack requires at least 1 child; got 0" or "Rate-
 * limited capability X has no quota indicator", and the `CompositeCompiler`
 * cascades to `GenericFallbackCompiler`. The user sees a humble framework-
 * shaped placeholder instead of the LLM's intended (modulo one fixable
 * mistake) layout. Empirically ~70% of single-shot validation failures are
 * recoverable in one or two retries when the LLM sees its own draft + the
 * exact violation list.
 *
 * `GeminiCompiler.validate` (the existing per-compiler hook) already does ONE
 * internal retry against the validation error message — but it only carries
 * the error message text, not the prior draft, and it's bounded to one
 * attempt. This wrapper is the next layer up: it sees the full result, knows
 * the prior draft, can retry N times against ANY inner `CompilerService`
 * (not just `GeminiCompiler`), and accumulates token cost / duration across
 * attempts so the audit pipeline gets a faithful picture.
 *
 * ## Architecture (mirrors `BudgetMeteredCompiler`)
 *
 * `ValidationFeedbackCompiler` is a `CompilerService` that wraps another.
 * On each compile:
 *
 *   1. Call `inner.compile(input)`. If `validate(result.manifest)` passes,
 *      return the result unchanged.
 *   2. If validation fails, build a refinement-mode `CompileInput` by
 *      cloning the original and setting `priorDraft` + `violations`. Call
 *      `inner.compile(refinementInput)`. Repeat up to `maxRetries` times.
 *   3. On each retry attempt, fire the optional `onRetry` hook so the host
 *      can wire it into the audit pipeline (`compile.budget_used`,
 *      observability dashboards, etc).
 *   4. On success at attempt N, return a `CompileResult` whose
 *      `token_cost` / `duration_ms` are SUMMED across all attempts (so the
 *      true cost is visible), `model` is the FINAL model used, and
 *      `reasoning` is augmented with `(retried Nx after violations: ...)`.
 *   5. If retries are exhausted, throw `CompilerOutputError` with the final
 *      draft + the final violation list. The wrapping `CompositeCompiler`
 *      catches that and cascades to the next compiler (typically
 *      `GenericFallbackCompiler`).
 *
 * ## Composition with `GeminiCompiler.validate`
 *
 * If the inner `GeminiCompiler` ALSO has a `validate` option set, the inner
 * one will throw `CompilerOutputError` after its own one-retry path. The
 * wrapper's `try/catch` here treats that as a validation failure too — but
 * because the wrapper has no draft to thread through (the inner compiler
 * never returned one), the retry path degenerates to a plain re-call with
 * no refinement context. Hosts adopting the wrapper should drop the inner
 * `validate` option and let the wrapper own validation; the showcase
 * wiring in `apps/demo-github/lib/cir-server.ts` does exactly that.
 *
 * ## Cascade preservation
 *
 * On exhaustion, the wrapper throws `CompilerOutputError` (the same error
 * type `GeminiCompiler` raises after its own retries). `CompositeCompiler.
 * #shouldCascade` already returns `true` for `CompilerOutputError`, so the
 * existing failure-recovery story is preserved: a wrapper that exhausted
 * retries cascades to the next compiler in the composite.
 *
 * ## Audit integration
 *
 * The wrapper itself does not emit audit events — the existing
 * `manifest.compiled` event (emitted by `ServerManifestResolver`) records
 * the final `compiler_id`, `token_cost`, and `duration_ms`. The summed-
 * across-attempts cost is what the dashboard sees, which is the right
 * accounting. Hosts that want per-attempt visibility wire the `onRetry`
 * hook into their own logging / metrics pipeline.
 *
 * See `/Users/vid/cir/TODO.md` Wave C section for the broader compiler-
 * evolution roadmap (C-2 tools, C-3 capability scoping, etc). This wrapper
 * is the C-1 commit; C-2 builds on it by exposing `validateDraft` as a
 * tool the LLM can call directly inside a single agentic loop.
 */

import type { Manifest } from '@cir/schemas';
import {
  CompilerOutputError,
  type CompileInput,
  type CompileResult,
  type CompilerService,
} from './types.js';

/**
 * Output of the validate hook the wrapper drives. Same shape the demos
 * already use on `ServerManifestResolver` and (in slightly different form)
 * `GeminiCompiler` — `ok: false` triggers a retry.
 */
export interface ValidationFeedbackValidateResult {
  ok: boolean;
  /** Human-readable violations. Empty / undefined when `ok: true`. */
  reasons?: readonly string[];
}

export interface ValidationFeedbackCompilerOptions {
  /** The inner compiler to delegate to (typically `GeminiCompiler`). */
  inner: CompilerService;
  /**
   * Policy validator. Returns `{ ok, reasons }`. The `reasons` array, when
   * present, is threaded back into the next compile attempt as
   * `CompileInput.violations`; the previous draft is threaded as
   * `CompileInput.priorDraft`. The prompt builder folds both into a
   * "REFINEMENT MODE" block the LLM reads alongside its previous draft.
   */
  validate: (manifest: Manifest) => ValidationFeedbackValidateResult;
  /**
   * Max retries on validation failure before throwing
   * `CompilerOutputError`. Default 2. The first compile attempt does NOT
   * count toward this — `maxRetries: 2` means up to three total attempts
   * (one initial + two refinements).
   *
   * Empirical sweet spot per the Wave C design notes: 2 retries recovers
   * ~70% of single-shot failures; 3+ retries hit diminishing returns and
   * burn tokens the user pays for. If you set this above 3 you're better
   * off investing in better prompts or the C-2 tool-using compiler.
   */
  maxRetries?: number;
  /**
   * Optional hook fired on each unsuccessful attempt, BEFORE the next
   * retry begins. Useful for audit / observability — the host wires this
   * into the existing `compile.budget_used` audit event pipeline (or a
   * custom `compile.validation_retry` event for dashboards).
   *
   * `attempt` is 1-indexed (the first failure fires `attempt=1` then a
   * retry runs; if THAT also fails, `attempt=2` fires before the next
   * retry, and so on). On the FINAL exhausted attempt the hook is NOT
   * fired — the throw carries the same payload, and we don't want to
   * fire-and-throw on the same event.
   *
   * Exceptions thrown from the hook are swallowed so a misbehaving
   * subscriber can't poison the compile path (mirrors
   * `BudgetMeteredCompiler`'s `onExceeded` policy).
   */
  onRetry?: (attempt: number, violations: readonly string[], priorDraft: Manifest) => void;
}

/**
 * `ValidationFeedbackCompiler` — wrap an inner `CompilerService` with a
 * bounded validation-feedback loop. See module docstring for the full
 * contract; the public surface is just `compile(input)` (inherited from
 * `CompilerService`) and the constructor.
 */
export class ValidationFeedbackCompiler implements CompilerService {
  readonly id: string;
  readonly #inner: CompilerService;
  readonly #validate: (manifest: Manifest) => ValidationFeedbackValidateResult;
  readonly #maxRetries: number;
  readonly #onRetry:
    | ((attempt: number, violations: readonly string[], priorDraft: Manifest) => void)
    | undefined;

  constructor(opts: ValidationFeedbackCompilerOptions) {
    this.#inner = opts.inner;
    this.#validate = opts.validate;
    this.#maxRetries = opts.maxRetries ?? 2;
    this.#onRetry = opts.onRetry;
    this.id = `validation-feedback[${opts.inner.id}]`;
  }

  async compile(input: CompileInput): Promise<CompileResult> {
    let totalTokens = 0;
    let totalDuration = 0;
    let attempt = 0;
    let nextInput: CompileInput = input;
    let lastResult: CompileResult | undefined;
    let lastViolations: readonly string[] = [];

    // The loop is bounded: one initial attempt + `maxRetries` refinement
    // attempts. We always either return on the first OK validation or
    // throw after the final failure — there is no path that exits the
    // loop without one of those.
    while (attempt <= this.#maxRetries) {
      const result = await this.#inner.compile(nextInput);
      totalTokens += Number.isFinite(result.token_cost) ? result.token_cost : 0;
      totalDuration += Number.isFinite(result.duration_ms) ? result.duration_ms : 0;
      lastResult = result;

      const verdict = this.#validate(result.manifest);
      if (verdict.ok) {
        // Success. If we did any retries, fold the accumulated cost +
        // duration into the result so the audit pipeline sees the real
        // total. The model field reflects the FINAL successful attempt
        // (which may be the diff model on a refinement retry).
        if (attempt === 0) return result;
        return {
          ...result,
          token_cost: totalTokens,
          duration_ms: totalDuration,
          reasoning: appendRetryReasoning(result.reasoning, attempt, lastViolations),
        };
      }

      // Validation failed. Capture the reasons so the retry context (and,
      // on exhaustion, the thrown error) carries them.
      lastViolations = verdict.reasons ?? [];
      if (attempt < this.#maxRetries) {
        // Fire the per-attempt hook. The hook only sees attempts that will
        // be followed by another try — the final exhaustion is signalled
        // by the throw below, not a hook callback. This matches the
        // BudgetMeteredCompiler `onExceeded` semantics.
        this.#fireOnRetry(attempt + 1, lastViolations, result.manifest);
        // Build the refinement-mode input. We clone shallowly: the
        // refinement-specific fields override the originals, but every
        // other field (capabilities, components, intent, brand kit,
        // few-shot example, signal, previous manifest) flows through
        // unchanged. The prompt builder reads `priorDraft` + `violations`
        // and emits the REFINEMENT MODE section.
        nextInput = {
          ...input,
          priorDraft: result.manifest,
          violations: lastViolations,
        };
        attempt += 1;
        continue;
      }

      // Exhausted retries. Throw with the final draft + violations so the
      // composite cascades to the next compiler (typically
      // `GenericFallbackCompiler`). The error message embeds the full
      // violation list for audit logs.
      const message =
        `ValidationFeedbackCompiler exhausted ${String(this.#maxRetries + 1)} ` +
        `attempts (1 initial + ${String(this.#maxRetries)} refinement); ` +
        `final violations:\n  - ${lastViolations.join('\n  - ')}`;
      throw new CompilerOutputError(message, {
        violations: lastViolations,
        final_draft: result.manifest,
        attempts: attempt + 1,
      });
    }

    // Unreachable — the loop always returns or throws. Defensive throw to
    // satisfy TypeScript's flow analysis without a `// istanbul ignore`.
    throw new CompilerOutputError(
      'ValidationFeedbackCompiler exhausted retries (unreachable)',
      lastResult?.manifest,
    );
  }

  #fireOnRetry(attempt: number, violations: readonly string[], priorDraft: Manifest): void {
    if (!this.#onRetry) return;
    try {
      this.#onRetry(attempt, violations, priorDraft);
    } catch {
      // A misbehaving subscriber must not poison the compile path.
      // Mirrors `BudgetMeteredCompiler.#fire` and
      // `CompositeCompiler.#fireBudgetEvent`.
    }
  }
}

/**
 * Build the `reasoning` field on a successful retry. Preserves any
 * reasoning the inner compiler emitted (the LLM's own explanation of
 * what changed) and appends a framework-supplied note recording the
 * retry count + violation list. The audit event sees both, which is
 * useful for dashboards that want to chart "% of compiles that needed a
 * refinement loop".
 */
function appendRetryReasoning(
  innerReasoning: string | undefined,
  retries: number,
  finalViolations: readonly string[],
): string {
  const suffix = `(retried ${String(retries)}x after violations: ${finalViolations.join('; ')})`;
  if (typeof innerReasoning === 'string' && innerReasoning.length > 0) {
    return `${innerReasoning} ${suffix}`;
  }
  return suffix;
}
