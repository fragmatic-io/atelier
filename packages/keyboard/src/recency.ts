// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `ActionRecencyTracker` — Wave 11 / Int-3.
 *
 * Linear's command palette ranks recent actions higher in the fuzzy-match
 * results. We model this as a tiny pluggable contract so hosts can plug a
 * persistent store (vault-backed, IndexedDB-backed, server-backed) without
 * the palette caring how recency is computed.
 *
 * The bundled `InMemoryRecencyTracker` exposes a sliding-window weight in
 * `[0, 1]` that decays smoothly: the most recently bumped action carries a
 * weight of 1, and earlier bumps decay exponentially with a configurable
 * half-life.
 */

/**
 * Pluggable contract — bump on invoke, query on render.
 */
export interface ActionRecencyTracker {
  /** Record that `actionId` was just invoked. Cheap; called per-keystroke. */
  bump(actionId: string): void;
  /**
   * Return a weight in `[0, 1]` describing how recently the action was
   * invoked. `0` = never (or so long ago we no longer remember); `1` = just
   * fired. The fuzzy-match scorer multiplies its base score by `1 + weight`
   * so a matching action that was used recently outranks an equally-good
   * match that wasn't.
   */
  weight(actionId: string): number;
}

/**
 * Sliding-window in-memory tracker. Each bump records the timestamp; the
 * weight is `0.5 ** ((now - lastBump) / halfLifeMs)`, clamped to `[0, 1]`.
 *
 *  - `halfLifeMs` defaults to 5 minutes — short enough that "what I did
 *    a minute ago" is still ranked, long enough that an hour-old action
 *    has effectively zero weight.
 *  - `now` defaults to `Date.now()`. Tests pass a fake clock.
 */
export interface InMemoryRecencyTrackerOptions {
  halfLifeMs?: number;
  now?: () => number;
}

export class InMemoryRecencyTracker implements ActionRecencyTracker {
  readonly #last = new Map<string, number>();
  readonly #halfLifeMs: number;
  readonly #now: () => number;

  constructor(options: InMemoryRecencyTrackerOptions = {}) {
    this.#halfLifeMs = options.halfLifeMs ?? 5 * 60 * 1000;
    this.#now = options.now ?? ((): number => Date.now());
  }

  bump(actionId: string): void {
    this.#last.set(actionId, this.#now());
  }

  weight(actionId: string): number {
    const last = this.#last.get(actionId);
    if (last === undefined) return 0;
    const delta = this.#now() - last;
    if (delta <= 0) return 1;
    // Half-life decay: 2^(-delta / halfLife).
    const w = Math.pow(0.5, delta / this.#halfLifeMs);
    if (w < 0) return 0;
    if (w > 1) return 1;
    return w;
  }
}

/**
 * No-op tracker — every action returns `0`. Used as the default when a host
 * doesn't wire recency, so palettes that consult `weight()` still work.
 */
export const NoopRecencyTracker: ActionRecencyTracker = Object.freeze({
  bump(_actionId: string): void {
    /* no-op */
  },
  weight(_actionId: string): number {
    return 0;
  },
});
