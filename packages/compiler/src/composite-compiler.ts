// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * CompositeCompiler — try compilers in order; fall back on error.
 *
 * Typical wire-up:
 *   new CompositeCompiler([
 *     new GeminiCompiler({ apiKey: process.env.GEMINI_API_KEY }),
 *     new FallbackCompiler({ lookup: manifestForRoute }),
 *   ])
 *
 * If the LLM is unavailable, hits its rate limit, or returns invalid output,
 * we serve the hand-written manifest. The audit event records which compiler
 * actually produced the result via `compiler_model`.
 *
 * ## Optional `BudgetMeter`
 *
 * The composite can be wrapped with a `BudgetMeter` (built from
 * `IntentProfile.compile_budget`) so a runaway deployment can't burn through
 * tokens unbounded. When the meter blocks a child compiler:
 *  - With `on_exhausted: 'fall_through'` (default), we skip that child and
 *    try the next one. The composite is still allowed to serve via a
 *    `FallbackCompiler` so the user sees a UI; the audit log records that
 *    the LLM tier was budget-blocked.
 *  - With `on_exhausted: 'fail'`, we throw `CompilerBudgetExhaustedError`
 *    so the caller can decide what to surface (typically: stale-while-budget
 *    via the resolver's last-known manifest).
 *
 * Either way, a `compile.budget_exceeded` audit event is emitted via
 * `onBudgetEvent` so dashboards can plot blocks. Successful compiles emit
 * `compile.budget_used` with the post-call remaining tokens / calls.
 *
 * `BudgetMeter` storage is in-memory and per-process. Multi-instance
 * deployments need a shared store (Redis); see `budget-meter.ts` for the
 * design note.
 */

import type { CompileBudget } from '@cir/schemas';
import type { BudgetMeter } from './budget-meter.js';
import {
  CompilerBudgetExhaustedError,
  CompilerOutputError,
  CompilerUnavailableError,
  type CompileInput,
  type CompileResult,
  type CompilerService,
} from './types.js';

/**
 * Out-of-band payload emitted when a compile is blocked by the budget meter.
 * Hosts subscribe via `onBudgetEvent` and translate this into an `AuditEvent`
 * (type `'compile.budget_exceeded'`).
 */
export interface BudgetExceededEventPayload {
  type: 'compile.budget_exceeded';
  /** The budget shape the meter is enforcing. */
  budget: CompileBudget;
  /** State BEFORE the blocked call: tokens used today + calls this hour. */
  used: { tokens_used_today: number; calls_this_hour: number };
  /** Identifier of the compiler that was about to run. */
  compiler_id: string;
  /** Why the meter blocked. e.g. `"token cap exhausted"`. */
  reason: string;
  /**
   * What this call would have cost in the worst case. We don't know the
   * actual cost until after the call, so this carries the budget shape's
   * caps as a conservative upper bound the dashboard can chart.
   */
  would_use: { tokens_max?: number; calls_max?: number };
}

/**
 * Out-of-band payload emitted after a successful compile that flowed through
 * the meter. Hosts translate this into a `'compile.budget_used'` audit event.
 */
export interface BudgetUsedEventPayload {
  type: 'compile.budget_used';
  compiler_id: string;
  tokens: number;
  remaining_tokens?: number;
  remaining_calls?: number;
}

export type BudgetEventPayload = BudgetExceededEventPayload | BudgetUsedEventPayload;

export interface CompositeCompilerOptions {
  /**
   * If true, swallow CompilerUnavailableError without trying further. Useful
   * when the first compiler's "unavailable" is a recoverable network blip
   * (you'd rather fall back than fail fast). Default true.
   */
  cascadeOnUnavailable?: boolean;
  /**
   * If true, swallow CompilerOutputError (validation/parse failures) and
   * cascade. Default true. Set false for strict environments where the LLM
   * MUST produce valid output and a fallback would mask a regression.
   */
  cascadeOnInvalidOutput?: boolean;
  /** Optional logger called on each cascade. */
  onCascade?: (from: string, error: unknown) => void;
  /**
   * Optional budget meter. When set, every child compiler call passes through
   * the meter; on block, the composite either falls through to the next
   * compiler (default) or throws `CompilerBudgetExhaustedError`.
   */
  budgetMeter?: BudgetMeter;
  /**
   * Hook fired on each budget event (block OR successful charge). Hosts use
   * this to translate into audit events for the streaming sink. Hook is
   * intentionally fire-and-forget — exceptions are swallowed so a bad
   * subscriber can't break the compile path.
   */
  onBudgetEvent?: (event: BudgetEventPayload) => void;
}

export class CompositeCompiler implements CompilerService {
  readonly id: string;
  readonly #compilers: readonly CompilerService[];
  readonly #cascadeOnUnavailable: boolean;
  readonly #cascadeOnInvalidOutput: boolean;
  readonly #onCascade: ((from: string, error: unknown) => void) | undefined;
  readonly #budgetMeter: BudgetMeter | undefined;
  readonly #onBudgetEvent: ((event: BudgetEventPayload) => void) | undefined;

  constructor(compilers: readonly CompilerService[], opts: CompositeCompilerOptions = {}) {
    if (compilers.length === 0) {
      throw new Error('CompositeCompiler requires at least one compiler');
    }
    this.#compilers = compilers;
    this.#cascadeOnUnavailable = opts.cascadeOnUnavailable ?? true;
    this.#cascadeOnInvalidOutput = opts.cascadeOnInvalidOutput ?? true;
    this.#onCascade = opts.onCascade;
    this.#budgetMeter = opts.budgetMeter;
    this.#onBudgetEvent = opts.onBudgetEvent;
    this.id = `composite[${compilers.map((c) => c.id).join(',')}]`;
  }

  async compile(input: CompileInput): Promise<CompileResult> {
    let lastError: unknown;
    for (const compiler of this.#compilers) {
      // Budget gate (per child compiler, so a fallback can still run when
      // the LLM tier is blocked).
      if (this.#budgetMeter) {
        const decision = this.#budgetMeter.check();
        if (!decision.allowed) {
          const budget = this.#budgetMeter.budget();
          const state = this.#budgetMeter.state();
          this.#fireBudgetEvent({
            type: 'compile.budget_exceeded',
            budget,
            used: {
              tokens_used_today: state.tokens_used_today,
              calls_this_hour: state.calls_this_hour,
            },
            compiler_id: compiler.id,
            reason: decision.reason ?? 'budget exhausted',
            would_use: {
              ...(budget.max_tokens_per_day !== undefined
                ? { tokens_max: budget.max_tokens_per_day }
                : {}),
              ...(budget.max_calls_per_hour !== undefined
                ? { calls_max: budget.max_calls_per_hour }
                : {}),
            },
          });
          if (budget.on_exhausted === 'fail') {
            throw new CompilerBudgetExhaustedError(
              `Compile budget exhausted for ${compiler.id}: ${decision.reason ?? 'budget exhausted'}`,
              decision.reason ?? 'budget exhausted',
            );
          }
          // fall_through: try the next child compiler.
          continue;
        }
      }

      try {
        const result = await compiler.compile(input);
        if (this.#budgetMeter) {
          this.#budgetMeter.record(result.token_cost);
          const state = this.#budgetMeter.state();
          const budget = this.#budgetMeter.budget();
          const remainingTokens =
            typeof budget.max_tokens_per_day === 'number'
              ? Math.max(0, budget.max_tokens_per_day - state.tokens_used_today)
              : undefined;
          const remainingCalls =
            typeof budget.max_calls_per_hour === 'number'
              ? Math.max(0, budget.max_calls_per_hour - state.calls_this_hour)
              : undefined;
          this.#fireBudgetEvent({
            type: 'compile.budget_used',
            compiler_id: compiler.id,
            tokens: result.token_cost,
            ...(remainingTokens !== undefined ? { remaining_tokens: remainingTokens } : {}),
            ...(remainingCalls !== undefined ? { remaining_calls: remainingCalls } : {}),
          });
        }
        return result;
      } catch (err) {
        lastError = err;
        const cascadable = this.#shouldCascade(err);
        if (!cascadable) throw err;
        this.#onCascade?.(compiler.id, err);
      }
    }
    throw new CompilerOutputError(
      `CompositeCompiler exhausted all compilers (${String(this.#compilers.length)})`,
      lastError,
    );
  }

  #shouldCascade(err: unknown): boolean {
    if (err instanceof CompilerUnavailableError) return this.#cascadeOnUnavailable;
    if (err instanceof CompilerOutputError) return this.#cascadeOnInvalidOutput;
    // Budget exhaustion with on_exhausted='fail' must propagate; the loop
    // already threw above before we got here, but defend in depth.
    if (err instanceof CompilerBudgetExhaustedError) return false;
    // Network errors, abort signals, generic Error — cascade by default;
    // it's safer to fall back than to surface a hard error to the user.
    return true;
  }

  #fireBudgetEvent(event: BudgetEventPayload): void {
    if (!this.#onBudgetEvent) return;
    try {
      this.#onBudgetEvent(event);
    } catch {
      // A misbehaving subscriber can't poison the compile path.
    }
  }
}
