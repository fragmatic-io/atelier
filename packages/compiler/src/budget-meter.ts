// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * BudgetMeter — token + call rate limiter for compile calls.
 *
 * Today nothing stops a naïve deployment from running up a $500 Gemini bill in
 * an afternoon. The meter wraps `CompositeCompiler` so each child compiler is
 * gated by a per-user budget pulled off `IntentProfile.compile_budget`. When
 * the budget is exhausted the composite either falls through to the next
 * compiler (default) or throws `CompilerBudgetExhaustedError` — both paths
 * also emit a `compile.budget_exceeded` audit event so dashboards see it.
 *
 * Rollovers happen on UTC boundaries: day at 00:00:00, hour on the hour. UTC
 * is the only sensible default because deployments span timezones and CI must
 * be reproducible.
 *
 * Storage is **in-memory, per-process.** Production deployments running more
 * than one compile worker will need a shared backing store (Redis, similar)
 * so a user with a 100k/day budget can't mint 100k tokens on each instance.
 * That is an S-4 (production durability) concern — out of scope here. The
 * `BudgetMeter` API is deliberately small and synchronous so a Redis-backed
 * variant can implement the same surface without surprising callers.
 *
 * The meter is a "test seam" by design: every clock read goes through the
 * `now` option so unit tests can fast-forward across day/hour boundaries
 * without touching `Date.now()`.
 */

import type { CompileBudget } from '@cir/schemas';

export interface BudgetMeterOptions {
  /** The budget to enforce. Empty fields disable that axis. */
  budget: CompileBudget;
  /**
   * Optional clock seam. Defaults to `() => Date.now()`. Tests inject a
   * mutable counter to step through hour/day rollovers deterministically.
   */
  now?: () => number;
}

/** A snapshot of the meter's internal state. Useful for tests + dashboards. */
export interface BudgetState {
  tokens_used_today: number;
  calls_this_hour: number;
  /** Epoch-ms of the start of the current UTC day window. */
  day_started_at: number;
  /** Epoch-ms of the start of the current UTC hour window. */
  hour_started_at: number;
}

/**
 * Result of a `check()` call.
 *
 * `allowed === true` means the meter has incremented the call counter and
 * the caller may proceed with the compile. On `false`, `reason` carries a
 * short human-readable string ("token cap exhausted" or "call rate exceeded")
 * so the audit emitter can attribute the block.
 *
 * `remaining_tokens` and `remaining_calls` are reported after the increment
 * so dashboards can plot the post-call state. They are `undefined` when the
 * corresponding axis is uncapped.
 */
export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  remaining_tokens?: number;
  remaining_calls?: number;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Floor `t` to the start of its UTC day. */
function startOfUtcDay(t: number): number {
  return Math.floor(t / MS_PER_DAY) * MS_PER_DAY;
}

/** Floor `t` to the start of its UTC hour. */
function startOfUtcHour(t: number): number {
  return Math.floor(t / MS_PER_HOUR) * MS_PER_HOUR;
}

export class BudgetMeter {
  readonly #budget: CompileBudget;
  readonly #now: () => number;
  #tokensUsedToday = 0;
  #callsThisHour = 0;
  #dayStartedAt: number;
  #hourStartedAt: number;

  constructor(opts: BudgetMeterOptions) {
    this.#budget = opts.budget;
    this.#now = opts.now ?? ((): number => Date.now());
    const t = this.#now();
    this.#dayStartedAt = startOfUtcDay(t);
    this.#hourStartedAt = startOfUtcHour(t);
  }

  /**
   * Decide whether a compile may proceed. On `allowed: true` the call
   * counter is incremented; the token tally is updated separately by
   * `record()` once the compile returns its actual `token_cost`. (We
   * count calls at the gate so a misbehaving caller can't spin forever
   * even if every call costs zero tokens.)
   */
  check(): BudgetCheckResult {
    this.#rolloverIfNeeded();
    const maxTokens = this.#budget.max_tokens_per_day;
    const maxCalls = this.#budget.max_calls_per_hour;

    if (typeof maxTokens === 'number' && this.#tokensUsedToday >= maxTokens) {
      return {
        allowed: false,
        reason: 'token cap exhausted',
        remaining_tokens: 0,
        ...(typeof maxCalls === 'number'
          ? { remaining_calls: Math.max(0, maxCalls - this.#callsThisHour) }
          : {}),
      };
    }
    if (typeof maxCalls === 'number' && this.#callsThisHour >= maxCalls) {
      return {
        allowed: false,
        reason: 'call rate exceeded',
        ...(typeof maxTokens === 'number'
          ? { remaining_tokens: Math.max(0, maxTokens - this.#tokensUsedToday) }
          : {}),
        remaining_calls: 0,
      };
    }

    this.#callsThisHour += 1;
    return {
      allowed: true,
      ...(typeof maxTokens === 'number'
        ? { remaining_tokens: Math.max(0, maxTokens - this.#tokensUsedToday) }
        : {}),
      ...(typeof maxCalls === 'number'
        ? { remaining_calls: Math.max(0, maxCalls - this.#callsThisHour) }
        : {}),
    };
  }

  /**
   * Record the token cost from a successful compile. Called by the wrapper
   * after `compile()` resolves. Negative or non-finite values are clamped
   * to zero — defence in depth against a buggy compiler.
   */
  record(tokens: number): void {
    this.#rolloverIfNeeded();
    if (!Number.isFinite(tokens) || tokens <= 0) return;
    this.#tokensUsedToday += Math.floor(tokens);
  }

  /** Internal state snapshot — for tests and observability dashboards. */
  state(): BudgetState {
    this.#rolloverIfNeeded();
    return {
      tokens_used_today: this.#tokensUsedToday,
      calls_this_hour: this.#callsThisHour,
      day_started_at: this.#dayStartedAt,
      hour_started_at: this.#hourStartedAt,
    };
  }

  /** Reset to a fresh state. Test seam — production never calls this. */
  reset(): void {
    const t = this.#now();
    this.#tokensUsedToday = 0;
    this.#callsThisHour = 0;
    this.#dayStartedAt = startOfUtcDay(t);
    this.#hourStartedAt = startOfUtcHour(t);
  }

  /** Returns the underlying budget shape; used to populate audit payloads. */
  budget(): CompileBudget {
    return this.#budget;
  }

  /**
   * Roll over the day/hour windows if the wall clock has moved past the
   * current boundary. Called at the top of every public method so callers
   * can't observe a stale window.
   */
  #rolloverIfNeeded(): void {
    const t = this.#now();
    const day = startOfUtcDay(t);
    if (day !== this.#dayStartedAt) {
      this.#dayStartedAt = day;
      this.#tokensUsedToday = 0;
    }
    const hour = startOfUtcHour(t);
    if (hour !== this.#hourStartedAt) {
      this.#hourStartedAt = hour;
      this.#callsThisHour = 0;
    }
  }
}
