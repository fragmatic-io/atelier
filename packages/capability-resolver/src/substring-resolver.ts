// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `SubstringCapabilityResolver` — the baseline scoping resolver. No LLM
 * call; pure substring + token-overlap match against capability id and
 * description. This is the same logic `@atelier/compiler`'s
 * `fallbackFindCapability` ships, but properly packaged so:
 *
 *   - hosts can use it as a `CapabilityResolver` directly (no LLM needed),
 *   - the two-stage resolver can cascade to it on stage-1 failure,
 *   - tests have a deterministic baseline that is easy to mock.
 *
 * It is intentionally permissive: any whitespace-separated intent term
 * that substring-matches an id or description scores the capability. The
 * score is the count of distinct matching terms — so an intent like
 * `"archive thread"` ranks `thread.archive` (matches both terms) above
 * `thread.list` (matches one) above `repo.list` (matches none). Ties are
 * broken by registry insertion order, which keeps the algorithm
 * deterministic without reaching for hash-based ordering.
 *
 * The substring approach has a known accuracy ceiling — a query like
 * "remove a chat" won't match `thread.archive` because none of the words
 * overlap. The two-stage resolver exists exactly to lift that ceiling;
 * S-7 lifts it again with proper vector embeddings.
 */

import type { Capability } from '@atelier/schemas';
import type { CapabilityRef, CapabilityResolver, ScopeRequest } from './types.js';

/**
 * Tunables for the substring resolver. None are required — defaults
 * match the existing C-2 fallback behaviour.
 */
export interface SubstringCapabilityResolverOptions {
  /**
   * Override the resolver `id`. Defaults to `'substring'`. Hosts that
   * wrap the resolver in a side-effect-only middleware sometimes set
   * this to a more descriptive identifier for audit.
   */
  id?: string;
  /**
   * Minimum term length. Tokens shorter than this are dropped. Default
   * 2 — guards against a single-letter typo dragging in every capability
   * whose id contains that letter. Set to 1 to disable.
   */
  minTermLength?: number;
}

/**
 * Lowercase, whitespace-split, length-filtered tokenization. Same shape
 * as `tool-environment.ts`'s `tokenize` so the two implementations agree
 * about what "matches the intent" means.
 */
function tokenize(query: string, minTermLength: number): readonly string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= minTermLength);
}

/**
 * Score a single capability against a token set. Returns the number of
 * distinct terms that substring-match either the id or the description.
 * Zero means "irrelevant" — the resolver drops zero-score capabilities.
 */
function scoreCapability(id: string, description: string, terms: readonly string[]): number {
  const lowerId = id.toLowerCase();
  const lowerDesc = description.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (lowerId.includes(term) || lowerDesc.includes(term)) score += 1;
  }
  return score;
}

export class SubstringCapabilityResolver implements CapabilityResolver {
  readonly id: string;
  readonly #minTermLength: number;

  constructor(opts: SubstringCapabilityResolverOptions = {}) {
    this.id = opts.id ?? 'substring';
    this.#minTermLength = Math.max(1, opts.minTermLength ?? 2);
  }

  // The substring resolver does not actually await anything; the async
  // signature exists to satisfy `CapabilityResolver` (the production
  // two-stage variant unavoidably awaits its tiny-model call).
  // eslint-disable-next-line @typescript-eslint/require-await
  async scope(
    request: ScopeRequest,
    k: number,
    registry: Readonly<Record<string, Capability>>,
  ): Promise<readonly CapabilityRef[]> {
    const terms = tokenize(request.intent, this.#minTermLength);
    if (terms.length === 0) return [];
    if (k <= 0) return [];

    type Scored = { ref: CapabilityRef; score: number; idx: number };
    const scored: Scored[] = [];
    let idx = 0;
    for (const [id, cap] of Object.entries(registry)) {
      const desc = (cap as { description?: string }).description ?? '';
      const score = scoreCapability(id, desc, terms);
      if (score > 0) {
        scored.push({
          ref: desc.length > 0 ? { id, description: desc } : { id },
          score,
          idx,
        });
      }
      idx += 1;
    }
    // Stable: higher score first, then registry insertion order.
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    return scored.slice(0, k).map((s) => s.ref);
  }
}
