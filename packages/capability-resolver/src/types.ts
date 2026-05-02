// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `CapabilityResolver` — abstract scoping interface for Wave 10 / S-1 (also
 * tracked as Wave C / Phase C-3).
 *
 * The resolver answers a single question: **given a free-form intent and a
 * route, which capability ids are most likely needed for this compile?**
 * The answer is a bounded list (`k`, default 30) that the production
 * `ToolUsingCompiler` consumes through its `SemanticSearch` seam — the
 * primary Pro-model only ever sees the scoped subset, not the full
 * registry.
 *
 * Two implementations ship in this package:
 *
 *   - `SubstringCapabilityResolver` — fast, free, no LLM. The same
 *     fallback logic `ToolUsingCompiler` ships internally, but properly
 *     packaged + tunable + tested.
 *   - `TwoStageCapabilityResolver` — production. Stage 1 calls a tiny
 *     model (e.g. `gemini-2.5-flash`) over 1-line registry summaries and
 *     returns the top-K ids. Stage 2 is the host's existing primary
 *     compiler.
 *
 * The interface is intentionally minimal so a vector-embedding variant
 * (S-7) can drop in later without changing callers. Everything beyond
 * `scope(query, k)` is implementation detail.
 *
 * `CapabilityRef` is re-exported from `@atelier/compiler` (where it lives
 * alongside `SemanticSearch`) to keep one source of truth across packages.
 */

import type { Capability } from '@atelier/schemas';
export type { CapabilityRef } from '@atelier/compiler';

/**
 * Stage-1 input. Carries everything the resolver needs to decide which
 * capabilities are in scope for a given compile attempt:
 *
 *   - `intent` — the free-form intent string (typically the user prompt
 *     or compile-driver intent text). Required.
 *   - `route` — the route being compiled, used as part of the cache key
 *     and surfaced to the tiny model so route-specific intent can pick a
 *     more focused subset.
 *   - `userId` / `appId` — used for cache scoping AND for budget
 *     attribution (the `BudgetMeteredCompiler` keys budgets by these).
 *
 * Optional extras let hosts push extra grounding the tiny model can use
 * without bloating the canonical contract.
 */
export interface ScopeRequest {
  /** Free-form intent string driving capability selection. */
  intent: string;
  /** Route being compiled. */
  route: string;
  /** User id for cache + budget attribution. */
  userId: string;
  /** App id for cache + budget attribution. */
  appId: string;
  /** Optional abort signal. Forwarded to the underlying LLM client when set. */
  signal?: AbortSignal;
}

/**
 * The full resolver-facing contract. The host wires a `CapabilityResolver`
 * once and points its `ToolUsingCompiler` at the resulting `SemanticSearch`
 * adapter; the wrapper invokes `scope(...)` whenever the agent calls
 * `findCapability(intent, k)`.
 *
 * Implementations are responsible for:
 *   - Returning a list of `CapabilityRef`s drawn from `registry`. The list
 *     MAY be smaller than `k` when the implementation can't justify more.
 *   - Honouring `request.signal` if supplied (no LLM is in scope here, but
 *     the two-stage variant does honour it).
 *   - Falling back gracefully on any error. The substring resolver is
 *     allergic to throwing; the two-stage resolver MUST cascade to a
 *     secondary `CapabilityResolver` (typically the substring one) on
 *     stage-1 failure rather than failing the whole compile.
 *
 * This is the seam future RAG / vector-embedding variants implement.
 */
export interface CapabilityResolver {
  /**
   * Stable identifier surfaced in audit / logs. Conventionally
   * `'<implementation>[<hint>]'` — e.g. `'two-stage[gemini-2.5-flash]'`.
   */
  readonly id: string;
  /**
   * Return up to `k` capability refs (id + description) most likely
   * needed for this `request`. The order matters — callers feed the
   * first results into the primary compiler in the order returned, so
   * implementations should rank by relevance.
   */
  scope(
    request: ScopeRequest,
    k: number,
    registry: Readonly<Record<string, Capability>>,
  ): Promise<readonly { id: string; description?: string }[]>;
}

/**
 * Default top-K used by `semanticSearchFromResolver` when callers don't
 * pass an explicit `k`. The C-2 `findCapability` tool surfaces a `k` arg
 * with `default: 5`, but the stage-1 contract is "give me 30" — so when
 * the agent asks for 5, the resolver returns up to 5; when it doesn't
 * supply k at all, we widen to this default.
 *
 * 30 is intentionally larger than the 5/20 tool defaults because the
 * resolver is the wide-net pre-pass; the agent picks from this set. The
 * full registry could be 1000+; 30 is sized so the primary Pro model
 * sees roughly 5-10kB of capability schemas, well within the prompt
 * budget that motivated this whole track.
 */
export const DEFAULT_SCOPING_K = 30;
