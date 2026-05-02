// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
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
import { BudgetExceededError } from './server-resolver.js';
import type { CompileInput, CompileResult, CompilerService } from './types.js';

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

// ---------------------------------------------------------------------------
// S-6: per-(user, app) BudgetCounter + BudgetMeteredCompiler
// ---------------------------------------------------------------------------
//
// The `BudgetMeter` above is a per-process tally: one budget shape, shared
// across every caller. That's the right shape inside a single `CompositeCompiler`
// where the host has decided "this LLM tier deserves at most N tokens/day,
// regardless of who's compiling".
//
// `BudgetCounter` is the per-(user, app) view. Each compile is attributed to
// a specific user inside a specific app, and the host enforces one budget
// shape per user. Production deployments back this with Redis so the count
// is shared across compile workers; the in-memory implementation here is a
// development / single-process convenience and a test seam.

/**
 * Per-(user, app) budget counter. The counter answers two questions for
 * each compile attempt — "how many tokens has this user consumed in the
 * rolling 24h window?" and "how many compile calls in the rolling 1h
 * window?" — and records each successful compile's token cost.
 *
 * The window semantics are intentionally vague ("rolling 24h" vs "wall-clock
 * UTC day") because real backends differ: Redis sorted-set windows are
 * naturally rolling, while a Postgres counters table partitioned by day is
 * naturally wall-clock. The contract is "the counter knows its own
 * window"; callers don't.
 *
 * All methods may be sync or async — Redis-backed implementations are
 * unavoidably async, but in-process counters can be hot-path-sync.
 *
 * Storage is the host's responsibility. The framework ships
 * `InMemoryBudgetCounter` for development; production uses something
 * durable (Redis, Postgres, the host's existing rate-limit table).
 */
export interface BudgetCounter {
  /**
   * Tokens consumed by `(userId, appId)` in the rolling 24-hour window
   * (or the wall-clock day, host's choice). Returned as `number` (sync) or
   * `Promise<number>` (async); callers `await` either way.
   */
  tokensInWindow(userId: string, appId: string): Promise<number> | number;
  /**
   * Number of compile calls by `(userId, appId)` in the rolling 1-hour
   * window. Same sync / async semantics as `tokensInWindow`.
   */
  callsInWindow(userId: string, appId: string): Promise<number> | number;
  /**
   * Record a successful compile's token cost. Implementations also bump
   * the call count on this call (one record per compile), so callers do
   * not call a separate `recordCall`. Negative / non-finite values are
   * implementation-defined; the in-memory variant clamps to zero.
   */
  record(userId: string, appId: string, tokens: number): Promise<void> | void;
}

interface InMemoryEntry {
  /** Token-cost samples, each tagged with the wall-clock ms it landed at. */
  tokens: Array<{ at: number; cost: number }>;
  /** Wall-clock ms each call landed at. */
  calls: number[];
}

/**
 * Reference `BudgetCounter` for development and tests. Tracks
 * (timestamp, tokens) tuples in an array per `(userId, appId)` key and
 * filters on each read to compute the rolling-window total.
 *
 * Memory is bounded by GC: every read prunes samples older than the
 * 24-hour window. A pathological caller making millions of calls per
 * hour would still grow the calls array within the window — production
 * deployments use a Redis-backed counter for this reason, not because
 * the in-memory shape is unsafe at moderate scale.
 *
 * Inject `now` for deterministic tests.
 */
export class InMemoryBudgetCounter implements BudgetCounter {
  readonly #now: () => number;
  readonly #entries = new Map<string, InMemoryEntry>();

  constructor(opts?: { now?: () => number }) {
    this.#now = opts?.now ?? ((): number => Date.now());
  }

  tokensInWindow(userId: string, appId: string): number {
    const entry = this.#entries.get(this.#key(userId, appId));
    if (!entry) return 0;
    const cutoff = this.#now() - MS_PER_DAY;
    this.#prune(entry, cutoff);
    let total = 0;
    for (const t of entry.tokens) total += t.cost;
    return total;
  }

  callsInWindow(userId: string, appId: string): number {
    const entry = this.#entries.get(this.#key(userId, appId));
    if (!entry) return 0;
    const cutoff = this.#now() - MS_PER_HOUR;
    this.#pruneCalls(entry, cutoff);
    return entry.calls.length;
  }

  record(userId: string, appId: string, tokens: number): void {
    const k = this.#key(userId, appId);
    const entry = this.#entries.get(k) ?? { tokens: [], calls: [] };
    const at = this.#now();
    if (Number.isFinite(tokens) && tokens > 0) {
      entry.tokens.push({ at, cost: Math.floor(tokens) });
    }
    entry.calls.push(at);
    this.#entries.set(k, entry);
  }

  /** Clear all state. Test seam — production never calls this. */
  reset(): void {
    this.#entries.clear();
  }

  #key(userId: string, appId: string): string {
    return `${userId} ${appId}`;
  }

  #prune(entry: InMemoryEntry, cutoff: number): void {
    // Drop expired token samples in-place from the front.
    let i = 0;
    while (i < entry.tokens.length && entry.tokens[i]!.at < cutoff) i += 1;
    if (i > 0) entry.tokens.splice(0, i);
    // The hour cutoff is tighter than the day cutoff, so we let the call
    // pruner run on its own read.
  }

  #pruneCalls(entry: InMemoryEntry, cutoff: number): void {
    let i = 0;
    while (i < entry.calls.length && entry.calls[i]! < cutoff) i += 1;
    if (i > 0) entry.calls.splice(0, i);
  }
}

/**
 * Compute the **stricter** budget per axis when both an intent profile
 * AND a brand kit declare one.
 *
 * Intent is the user's per-grain budget; BrandKit is the host's safety
 * net. When both are set, the runtime takes the **min** along each axis
 * — neither side can widen the other. When only one side is set, that
 * one wins. When neither is set, the result is `undefined` (no
 * enforcement).
 *
 * `on_exhausted` resolves to the stricter policy: `'fail'` overrides
 * `'fall_through'` because failing closed is the safer default when the
 * two sides disagree (a host that wants `fall_through` despite a user's
 * `fail` is asking for an availability-over-correctness preference and
 * should configure the meter directly).
 */
export function mergeCompileBudgets(
  a: CompileBudget | undefined,
  b: CompileBudget | undefined,
): CompileBudget | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const merged: CompileBudget = {
    on_exhausted: a.on_exhausted === 'fail' || b.on_exhausted === 'fail' ? 'fail' : 'fall_through',
  };
  const minDefined = (x: number | undefined, y: number | undefined): number | undefined => {
    if (typeof x !== 'number') return y;
    if (typeof y !== 'number') return x;
    return Math.min(x, y);
  };
  const tokensPerDay = minDefined(a.max_tokens_per_day, b.max_tokens_per_day);
  if (typeof tokensPerDay === 'number') merged.max_tokens_per_day = tokensPerDay;
  const callsPerHour = minDefined(a.max_calls_per_hour, b.max_calls_per_hour);
  if (typeof callsPerHour === 'number') merged.max_calls_per_hour = callsPerHour;
  const tokensPerCall = minDefined(a.max_tokens_per_call, b.max_tokens_per_call);
  if (typeof tokensPerCall === 'number') merged.max_tokens_per_call = tokensPerCall;
  return merged;
}

/**
 * Reason payload passed to `BudgetMeteredCompiler`'s `onExceeded` hook.
 * `'tokens_per_day'` and `'calls_per_hour'` fire BEFORE the compile;
 * `'tokens_per_call'` fires AFTER (the wrapper has the token cost in
 * hand and only then knows the per-call cap was breached).
 */
export interface BudgetExceededReason {
  code: 'tokens_per_day' | 'calls_per_hour' | 'tokens_per_call';
  /** Plain-English description for logs / dashboards. */
  message: string;
  /** Observed value — either the pre-call counter or the actual token cost. */
  observed: number;
  /** The cap that was breached. */
  cap: number;
}

export interface BudgetMeteredCompilerOptions {
  /** The compiler being metered. */
  inner: CompilerService;
  /** Per-(user, app) usage tracker. */
  counter: BudgetCounter;
  /** Budget to enforce. */
  budget: CompileBudget;
  /**
   * Fired when a budget is breached. The handler receives the reason; for
   * pre-call breaches (`'tokens_per_day'`, `'calls_per_hour'`) the wrapper
   * throws `BudgetExceededError` AFTER calling the hook. For post-call
   * breaches (`'tokens_per_call'`), the wrapper logs but returns the
   * manifest — refusing it would just waste the token spend.
   *
   * The audit pipeline already emits `manifest.compiled` with
   * `compiler_model: 'fallback-generic'` (or whichever fallback ran) when
   * the cascade advances after a `BudgetExceededError`. No new audit
   * event is needed here; this hook is the host's chance to log /
   * instrument / alert.
   */
  onExceeded?: (reason: BudgetExceededReason) => void;
}

/**
 * `BudgetMeteredCompiler` — gates an inner `CompilerService` with a
 * per-(user, app) `BudgetCounter` against a `CompileBudget` shape.
 *
 * Behaviour:
 * 1. Read `counter.callsInWindow` and `counter.tokensInWindow`.
 * 2. If either projects to exceed its cap, fire `onExceeded` and throw
 *    `BudgetExceededError` (with `code` set). The error is cascade-
 *    friendly: `CompositeCompiler.#shouldCascade` returns true for
 *    generic errors, so the next compiler in the chain runs.
 * 3. Otherwise call `inner.compile(input)`.
 * 4. On success, call `counter.record(userId, appId, result.token_cost)`
 *    so the next attempt sees the updated tally.
 * 5. After success, if `max_tokens_per_call` was set and the actual
 *    `token_cost` exceeded it, fire `onExceeded` with
 *    `code: 'tokens_per_call'`. The manifest is returned anyway — the
 *    cap is a soft warning the host can act on (raise the cap, retune
 *    the prompt, route to a cheaper model on the next compile).
 * 6. On inner failure, do NOT record. Failed compiles cost the LLM
 *    provider tokens but not necessarily the framework — and even if
 *    they did, double-counting failed-then-fallback paths would distort
 *    the dashboards more than under-counting them.
 *
 * **Audit event policy.** A `BudgetExceededError` raised here propagates
 * up to `CompositeCompiler`, which advances to the next child compiler
 * (typically `GenericFallbackCompiler`). The resolver's existing
 * `manifest.compiled` audit event then records `compiler_model:
 * 'fallback-generic'`. Dashboards that watch for "the LLM tier was
 * skipped" should join on `compiler_model !== 'gemini-*'`. **No
 * dedicated `compile.budget_blocked` audit event is emitted by this
 * wrapper** — `onExceeded` is the host's hook for that.
 */
export class BudgetMeteredCompiler implements CompilerService {
  readonly id: string;
  readonly #inner: CompilerService;
  readonly #counter: BudgetCounter;
  readonly #budget: CompileBudget;
  readonly #onExceeded: ((reason: BudgetExceededReason) => void) | undefined;

  constructor(opts: BudgetMeteredCompilerOptions) {
    this.#inner = opts.inner;
    this.#counter = opts.counter;
    this.#budget = opts.budget;
    this.#onExceeded = opts.onExceeded;
    this.id = `budgeted[${opts.inner.id}]`;
  }

  async compile(input: CompileInput): Promise<CompileResult> {
    const { user_id, app_id } = input;
    const maxCalls = this.#budget.max_calls_per_hour;
    const maxTokens = this.#budget.max_tokens_per_day;

    if (typeof maxCalls === 'number') {
      const calls = await this.#counter.callsInWindow(user_id, app_id);
      if (calls >= maxCalls) {
        const reason: BudgetExceededReason = {
          code: 'calls_per_hour',
          message: `User ${user_id} exceeded ${String(maxCalls)} compile calls/hour`,
          observed: calls,
          cap: maxCalls,
        };
        this.#fire(reason);
        throw new BudgetExceededError(reason.message, user_id, calls, maxCalls, 'calls_per_hour');
      }
    }

    if (typeof maxTokens === 'number') {
      const tokens = await this.#counter.tokensInWindow(user_id, app_id);
      if (tokens >= maxTokens) {
        const reason: BudgetExceededReason = {
          code: 'tokens_per_day',
          message: `User ${user_id} exceeded ${String(maxTokens)} compile tokens/day`,
          observed: tokens,
          cap: maxTokens,
        };
        this.#fire(reason);
        throw new BudgetExceededError(reason.message, user_id, tokens, maxTokens, 'tokens_per_day');
      }
    }

    const result = await this.#inner.compile(input);

    // Record the cost ONLY on success. A failed compile didn't necessarily
    // burn tokens; double-counting it would distort the rolling totals.
    await this.#counter.record(user_id, app_id, result.token_cost);

    const maxPerCall = this.#budget.max_tokens_per_call;
    if (
      typeof maxPerCall === 'number' &&
      Number.isFinite(result.token_cost) &&
      result.token_cost > maxPerCall
    ) {
      this.#fire({
        code: 'tokens_per_call',
        message: `Compile for ${user_id} cost ${String(result.token_cost)} tokens (cap ${String(maxPerCall)})`,
        observed: result.token_cost,
        cap: maxPerCall,
      });
    }

    return result;
  }

  #fire(reason: BudgetExceededReason): void {
    if (!this.#onExceeded) return;
    try {
      this.#onExceeded(reason);
    } catch {
      // A misbehaving subscriber must not poison the compile path.
    }
  }
}
