// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `TwoStageCapabilityResolver` — the production scoping logic for Wave
 * 10 / S-1 (also tracked as Wave C / Phase C-3).
 *
 * Stage 1 (this resolver): summarise the registry into 1-line entries
 * and ask a tiny model — defaulting to `gemini-2.5-flash`, since
 * `gemini-2.0-flash-lite` is not documented in the workspace — for the
 * top-K capability ids most likely needed for `(intent, route)`.
 *
 * Stage 2 (caller): the host's primary `ToolUsingCompiler` (running the
 * full Pro model) only ever sees the K scoped capabilities. The token
 * cost on the cold prompt drops materially; accuracy improves because
 * the LLM only sees what it's actually using.
 *
 * ## Why two stages, not one
 *
 * Past ~200 capabilities, stuffing every schema into the cold prompt
 * stops fitting the budget. C-2 already addresses the **tool-call**
 * variant of the same problem (the agent discovers what it needs on
 * demand), but the agent is still walking a registry that may not fit.
 * Two-stage compile is the orthogonal axis: pre-pass the registry with
 * a cheap model, hand the slim result to the expensive model.
 *
 * This is the only place CIR introduces a second model call by design
 * — bounded multi-agent in the sense the project's architecture notes
 * endorse: each model has one job, the data flow is a strict DAG, and
 * the second model never talks back to the first.
 *
 * ## Cost discipline
 *
 * Stage-1 calls are real LLM calls and count toward the host's
 * `BudgetMeteredCompiler` counters when the host wires `recordTokens`.
 * Hosts that don't wire metering get the call for free; hosts that do
 * see stage-1 spend in the same `max_tokens_per_day` /
 * `max_calls_per_hour` budget as the Pro model.
 *
 * ## Cascade story
 *
 * Stage-1 failures (LLM error, malformed response, budget exceeded,
 * abort signal) MUST NOT fail the whole compile. The resolver falls
 * back to a configured `fallback` resolver — typically the substring
 * baseline — so the agent's `findCapability` always returns *something*
 * sensible. Hosts can observe stage-1 failures via the optional
 * `onStageOneFailure` hook (audit / alerting hook); the cascade itself
 * is automatic.
 */

import type { Capability } from '@cir/schemas';
import { SubstringCapabilityResolver } from './substring-resolver.js';
import {
  MemoryScopingCache,
  hashIntent,
  type ScopingCache,
  type ScopingCacheKey,
} from './cache.js';
import type { CapabilityRef, CapabilityResolver, ScopeRequest } from './types.js';

/**
 * Provider-agnostic LLM client used by the resolver. Implementations
 * adapt Gemini / Anthropic / OpenAI / etc. Tests inject a stub. The
 * client returns a list of capability ids the model picked from the
 * provided summaries.
 */
export interface ScopingLlmClient {
  /** Stable id surfaced as part of `TwoStageCapabilityResolver.id`. */
  readonly id: string;
  /**
   * Run one stage-1 turn against `req`. Implementations parse the
   * model's reply into a list of capability ids and return them with
   * the (best-effort) token cost. Throw on transport failure or
   * malformed reply — the resolver catches and cascades.
   */
  pickCapabilityIds(req: ScopingLlmRequest): Promise<ScopingLlmResponse>;
}

export interface ScopingLlmRequest {
  /** The intent string driving capability selection. */
  intent: string;
  /** The route being compiled (additional context). */
  route: string;
  /**
   * One-line summaries of each capability in the registry. Each entry
   * is `{ id, summary }` where `summary` is `description` truncated to
   * a single line. The LLM picks ids from this list — it cannot invent
   * a new id (the resolver post-validates).
   */
  summaries: readonly { id: string; summary: string }[];
  /** Max ids to return. */
  k: number;
  /** Optional abort signal forwarded to the underlying transport. */
  signal?: AbortSignal;
}

export interface ScopingLlmResponse {
  /**
   * Ids the model picked. The resolver post-validates: ids not in the
   * registry are dropped silently (the model occasionally hallucinates
   * a near-miss like `thread.archives` instead of `thread.archive`).
   */
  ids: readonly string[];
  /** Tokens consumed this call (prompt + response). 0 if unknown. */
  tokenCost: number;
  /** Provider model id (echoed into audit / observability). */
  model: string;
}

/**
 * Hook fired after each stage-1 attempt. The resolver passes the request
 * + the result + the wall-clock duration. Hosts wire this into their
 * existing `compile.budget_used` audit pipeline OR a dedicated
 * `compile.scoping_used` event. Exceptions thrown here are swallowed
 * (consistent with `ToolUsingCompiler.onToolCall`).
 */
export type ScopingObserver = (event: {
  intent: string;
  route: string;
  /** Number of capabilities in the registry the resolver was given. */
  registrySize: number;
  /** Number of refs returned to the caller. */
  pickedCount: number;
  /** True when the stage-1 call succeeded. False when we fell back. */
  stageOneOk: boolean;
  /** Stage-1 token cost (0 if cached / fell back). */
  tokenCost: number;
  /** Wall-clock duration of the resolver call in ms. */
  durationMs: number;
  /** True when the result was served from the cache. */
  cacheHit: boolean;
}) => void;

/**
 * Hook fired when the stage-1 LLM call throws or returns something the
 * resolver cannot use. The resolver still cascades; this is purely for
 * audit / alerting. Exceptions thrown here are swallowed.
 */
export type StageOneFailureObserver = (event: {
  intent: string;
  route: string;
  error: unknown;
}) => void;

/**
 * Hook fired after a successful stage-1 call so callers can attribute
 * the token cost to a per-(user, app) budget counter. The resolver does
 * NOT enforce budgets itself — that is the host's call (typically by
 * passing an `InMemoryBudgetCounter.record` reference here). Exceptions
 * thrown from the hook are swallowed.
 */
export type RecordStageOneTokensHook = (event: {
  userId: string;
  appId: string;
  tokens: number;
}) => void;

export interface TwoStageCapabilityResolverOptions {
  /** The tiny-model client (typically a Gemini Flash adapter). */
  client: ScopingLlmClient;
  /**
   * Fallback resolver used when stage-1 fails. Defaults to a fresh
   * `SubstringCapabilityResolver`. Hosts can pass a custom resolver
   * (e.g. one with a tuned `minTermLength`) for special cases.
   */
  fallback?: CapabilityResolver;
  /**
   * Result cache. Defaults to a fresh `MemoryScopingCache`. Production
   * deployments back this with Redis.
   */
  cache?: ScopingCache;
  /**
   * Override the resolver `id`. Defaults to
   * `'two-stage[<client.id>]'`.
   */
  id?: string;
  /** Observer fired after each scoping attempt. */
  onScope?: ScopingObserver;
  /** Observer fired when stage-1 fails (before the cascade). */
  onStageOneFailure?: StageOneFailureObserver;
  /** Hook called after each successful stage-1 call so the host can update a budget counter. */
  recordTokens?: RecordStageOneTokensHook;
  /**
   * Optional clock seam. Defaults to `Date.now`. Used for the
   * `durationMs` reported to `onScope`.
   */
  now?: () => number;
}

/**
 * Truncate a free-form description to a single line bounded at
 * `maxChars`. The tiny model needs the registry to fit in its prompt;
 * untruncated descriptions can be paragraphs long.
 */
function summarize(description: string | undefined, maxChars: number): string {
  if (!description) return '';
  // First newline wins; tabs collapsed to single spaces.
  const firstLine = description.split(/\r?\n/)[0]?.replace(/\t/g, ' ').trim() ?? '';
  if (firstLine.length <= maxChars) return firstLine;
  return firstLine.slice(0, Math.max(0, maxChars - 1)) + '…';
}

const DEFAULT_SUMMARY_CHARS = 120;

export class TwoStageCapabilityResolver implements CapabilityResolver {
  readonly id: string;
  readonly #client: ScopingLlmClient;
  readonly #fallback: CapabilityResolver;
  readonly #cache: ScopingCache;
  readonly #onScope: ScopingObserver | undefined;
  readonly #onStageOneFailure: StageOneFailureObserver | undefined;
  readonly #recordTokens: RecordStageOneTokensHook | undefined;
  readonly #now: () => number;

  constructor(opts: TwoStageCapabilityResolverOptions) {
    this.#client = opts.client;
    this.#fallback = opts.fallback ?? new SubstringCapabilityResolver();
    this.#cache = opts.cache ?? new MemoryScopingCache();
    this.#onScope = opts.onScope;
    this.#onStageOneFailure = opts.onStageOneFailure;
    this.#recordTokens = opts.recordTokens;
    this.#now = opts.now ?? ((): number => Date.now());
    this.id = opts.id ?? `two-stage[${opts.client.id}]`;
  }

  async scope(
    request: ScopeRequest,
    k: number,
    registry: Readonly<Record<string, Capability>>,
  ): Promise<readonly CapabilityRef[]> {
    if (k <= 0 || !request.intent) return [];

    const startedAt = this.#now();
    const cacheKey: ScopingCacheKey = {
      userId: request.userId,
      appId: request.appId,
      route: request.route,
      intentHash: hashIntent(`${request.intent}|k=${String(k)}`),
    };

    // Cache hit short-circuits stage 1.
    const cached = await this.#cache.get(cacheKey);
    if (cached) {
      const refs = cached.refs.slice(0, k);
      this.#fireOnScope({
        intent: request.intent,
        route: request.route,
        registrySize: Object.keys(registry).length,
        pickedCount: refs.length,
        stageOneOk: true,
        tokenCost: 0,
        durationMs: this.#now() - startedAt,
        cacheHit: true,
      });
      return refs;
    }

    // Stage 1 — tiny-model pick.
    const summaries = Object.entries(registry).map(([id, cap]) => ({
      id,
      summary: summarize((cap as { description?: string }).description, DEFAULT_SUMMARY_CHARS),
    }));

    try {
      const response = await this.#client.pickCapabilityIds({
        intent: request.intent,
        route: request.route,
        summaries,
        k,
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      });
      // Drop ids the model invented (post-validation).
      const refs: CapabilityRef[] = [];
      const seen = new Set<string>();
      for (const id of response.ids) {
        if (refs.length >= k) break;
        if (seen.has(id)) continue;
        const cap = registry[id];
        if (!cap) continue;
        seen.add(id);
        const desc = (cap as { description?: string }).description;
        refs.push(typeof desc === 'string' && desc.length > 0 ? { id, description: desc } : { id });
      }
      // If the model returned NOTHING (or only invented ids), treat as
      // a stage-1 failure and cascade. Returning an empty list here
      // would otherwise starve the agent.
      if (refs.length === 0) {
        throw new Error(
          `TwoStageCapabilityResolver: stage-1 returned ${String(response.ids.length)} id(s) but none matched the registry`,
        );
      }
      // Cache the validated subset (not the raw model output).
      await this.#cache.set(cacheKey, { refs, storedAt: this.#now() });
      // Attribute token cost to the host's budget counter, if any.
      this.#fireRecordTokens({
        userId: request.userId,
        appId: request.appId,
        tokens: response.tokenCost,
      });
      this.#fireOnScope({
        intent: request.intent,
        route: request.route,
        registrySize: Object.keys(registry).length,
        pickedCount: refs.length,
        stageOneOk: true,
        tokenCost: response.tokenCost,
        durationMs: this.#now() - startedAt,
        cacheHit: false,
      });
      return refs;
    } catch (err) {
      // Stage-1 failed. Cascade to the fallback resolver. Do NOT cache
      // fallback results — a transient stage-1 failure would otherwise
      // pin the substring result for that key indefinitely.
      this.#fireOnStageOneFailure({
        intent: request.intent,
        route: request.route,
        error: err,
      });
      const fallbackRefs = await this.#fallback.scope(request, k, registry);
      this.#fireOnScope({
        intent: request.intent,
        route: request.route,
        registrySize: Object.keys(registry).length,
        pickedCount: fallbackRefs.length,
        stageOneOk: false,
        tokenCost: 0,
        durationMs: this.#now() - startedAt,
        cacheHit: false,
      });
      return fallbackRefs;
    }
  }

  #fireOnScope(event: Parameters<ScopingObserver>[0]): void {
    if (!this.#onScope) return;
    try {
      this.#onScope(event);
    } catch {
      // A misbehaving subscriber must not poison the compile path.
    }
  }

  #fireOnStageOneFailure(event: Parameters<StageOneFailureObserver>[0]): void {
    if (!this.#onStageOneFailure) return;
    try {
      this.#onStageOneFailure(event);
    } catch {
      // ditto
    }
  }

  #fireRecordTokens(event: Parameters<RecordStageOneTokensHook>[0]): void {
    if (!this.#recordTokens) return;
    try {
      this.#recordTokens(event);
    } catch {
      // ditto
    }
  }
}
