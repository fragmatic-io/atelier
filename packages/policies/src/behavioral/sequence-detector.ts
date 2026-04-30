// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `SequenceDetector` — first real implementation behind the
 * `BehavioralPatternDetector` seam.
 *
 * Algorithm (intentionally naive, deterministic, no I/O, no LLM):
 *
 *  1. Per `user_id`, keep a sliding window of the last N `ObservedAction`s
 *     (default 50). Older observations evict in FIFO order.
 *  2. On every `observe()`, for each sequence length `L` in `sequenceLengths`
 *     (default `[2, 3, 4, 5]`), compute a stable hash of the last `L`
 *     capability ids in that user's window and increment a per-`(hash, user)`
 *     counter.
 *  3. `snapshot()` aggregates those counters across users and surfaces only
 *     patterns where:
 *       a) at least two distinct users have observed the same sequence
 *          (cross-user — this is what makes it a graduation candidate, not
 *          just one user's habit), and
 *       b) the total occurrences across users ≥ `threshold` (default 3).
 *
 * `toTrigger()` produces a `behavior.workaround_detected` trigger
 * (the closest fit in the existing `TriggerSchema`; there is no
 * separate `pattern_detected` member yet — adding one is V-6 territory).
 *
 * The hash is a deterministic non-crypto digest of the capability ids
 * joined with a `\x1f` (US — record separator) delimiter so that
 * sequences with the same ids in different orders hash differently and
 * `["foo", "bar"]` cannot collide with `["foobar"]`. Collisions are not
 * cryptographic threat-model territory here — the worst case is two
 * unrelated sequences sharing a counter, which inflates a count, not
 * exfiltrates data.
 *
 * Privacy: we never persist `args_fingerprint` or any raw input — the
 * sequences are pure capability-id chains.
 *
 * No I/O, no LLM, no network. Same observation stream → same snapshot,
 * always.
 */

import type { AppId, IsoDateTimeString, Trigger, UserId } from '@cir/schemas';
import type { BehavioralPatternDetector, DetectedPattern, ObservedAction } from './detector.js';

const DEFAULT_WINDOW_SIZE = 50;
const DEFAULT_SEQUENCE_LENGTHS = [2, 3, 4, 5] as const;
const DEFAULT_THRESHOLD = 3;

/** Field separator between capability ids in the hashed sequence. */
const SEQUENCE_DELIMITER = '\x1f';

export interface SequenceDetectorOptions {
  /** Window of recent actions per user (default 50). */
  windowSize?: number;
  /** Sequence length to consider (default `[2, 3, 4, 5]`). */
  sequenceLengths?: number[];
  /** Min occurrences before a pattern is reported (default 3). */
  threshold?: number;
  /** Optional clock for testing. Returns ms since epoch. */
  now?: () => number;
}

interface PatternBucket {
  /** The capability-id sequence in observation order. */
  capabilities: readonly string[];
  /** Per-user occurrence counts. */
  perUser: Map<string, number>;
  /** Last user that observed this sequence (used to scope a trigger). */
  lastUser: UserId;
  /** Last app that observed this sequence (used to scope a trigger). */
  lastApp: AppId;
  /** Iso datetime of the most recent observation. */
  lastSeen: IsoDateTimeString;
}

interface UserWindow {
  actions: ObservedAction[];
}

/**
 * Stable, non-crypto hash of an arbitrary string. FNV-1a 32-bit; sufficient
 * for keying a `Map`. Encoded as base-36 for compactness.
 */
function fnv1a(input: string): string {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // Multiply by FNV prime (16777619), keep 32-bit.
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned 32-bit.
  return (hash >>> 0).toString(36);
}

function hashSequence(capabilityIds: readonly string[]): string {
  return fnv1a(capabilityIds.join(SEQUENCE_DELIMITER));
}

function describePattern(capabilities: readonly string[], distinctUsers: number): string {
  const chain = capabilities.join(' → ');
  return `Sequence (${capabilities.length} steps) repeated by ${distinctUsers} users: ${chain}`;
}

export class SequenceDetector implements BehavioralPatternDetector {
  readonly #windowSize: number;
  readonly #sequenceLengths: readonly number[];
  readonly #threshold: number;
  readonly #now: () => number;
  readonly #windows = new Map<UserId, UserWindow>();
  readonly #patterns = new Map<string, PatternBucket>();

  constructor(opts: SequenceDetectorOptions = {}) {
    this.#windowSize = Math.max(1, opts.windowSize ?? DEFAULT_WINDOW_SIZE);
    const lengths =
      opts.sequenceLengths && opts.sequenceLengths.length > 0
        ? opts.sequenceLengths
        : [...DEFAULT_SEQUENCE_LENGTHS];
    // Guard: every length must be >= 2 (a length of 1 is just a repeated
    // single action, not a sequence). De-dupe.
    this.#sequenceLengths = Array.from(
      new Set(lengths.filter((l) => l >= 2 && Number.isInteger(l))),
    );
    if (this.#sequenceLengths.length === 0) {
      throw new Error('SequenceDetector: sequenceLengths must contain at least one integer >= 2');
    }
    this.#threshold = Math.max(1, opts.threshold ?? DEFAULT_THRESHOLD);
    this.#now = opts.now ?? Date.now;
  }

  observe(action: ObservedAction): void {
    let window = this.#windows.get(action.user_id);
    if (!window) {
      window = { actions: [] };
      this.#windows.set(action.user_id, window);
    }
    window.actions.push(action);
    if (window.actions.length > this.#windowSize) {
      window.actions.splice(0, window.actions.length - this.#windowSize);
    }

    for (const len of this.#sequenceLengths) {
      if (window.actions.length < len) continue;
      const tail = window.actions.slice(window.actions.length - len);
      const capabilities = tail.map((a) => a.capability_id);
      const hash = hashSequence(capabilities);
      let bucket = this.#patterns.get(hash);
      if (!bucket) {
        bucket = {
          capabilities,
          perUser: new Map(),
          lastUser: action.user_id,
          lastApp: action.app_id,
          lastSeen: action.occurred_at,
        };
        this.#patterns.set(hash, bucket);
      }
      bucket.perUser.set(action.user_id, (bucket.perUser.get(action.user_id) ?? 0) + 1);
      bucket.lastUser = action.user_id;
      bucket.lastApp = action.app_id;
      bucket.lastSeen = action.occurred_at;
    }
  }

  snapshot(): readonly DetectedPattern[] {
    const out: DetectedPattern[] = [];
    for (const [hash, bucket] of this.#patterns) {
      const distinctUsers = bucket.perUser.size;
      // Cross-user dedup: a single user repeating a sequence is a habit,
      // not a graduation candidate. Require at least two users.
      if (distinctUsers < 2) continue;
      let total = 0;
      for (const c of bucket.perUser.values()) total += c;
      if (total < this.#threshold) continue;
      out.push({
        pattern_id: `seq_${hash}`,
        description: describePattern(bucket.capabilities, distinctUsers),
        occurrences: total,
        proposed_recompile: bucket.capabilities.map((c) => `capability:${c}`),
      });
    }
    // Stable order: highest-occurrence first, then pattern_id ascending.
    out.sort((a, b) => b.occurrences - a.occurrences || a.pattern_id.localeCompare(b.pattern_id));
    return out;
  }

  toTrigger(pattern: DetectedPattern): Trigger {
    // Look up the bucket so we can scope the trigger to a real user/app.
    // The pattern_id format is `seq_<hash>`; recover the hash.
    const hash = pattern.pattern_id.startsWith('seq_')
      ? pattern.pattern_id.slice(4)
      : pattern.pattern_id;
    const bucket = this.#patterns.get(hash);
    if (!bucket) {
      throw new Error(
        `SequenceDetector.toTrigger: unknown pattern ${pattern.pattern_id} (was it produced by another detector?)`,
      );
    }
    // `behavior.pattern_detected` is the right semantic here: this signal is a
    // POSITIVE convergence across users (worth promoting to a recipe), not a
    // workaround for a missing capability. The latter has its own variant
    // (`behavior.workaround_detected`).
    const trigger: Trigger = {
      type: 'behavior.pattern_detected',
      user_id: bucket.lastUser,
      app_id: bucket.lastApp,
      pattern_id: pattern.pattern_id,
      description: pattern.description,
      capability_ids: pattern.proposed_recompile ?? [],
      occurrences: pattern.occurrences,
      distinct_users: bucket.perUser.size,
    };
    return trigger;
  }

  /**
   * Wall-clock the detector was constructed with. Exposed so tests and
   * the admin route can render a "detected_at" stamp deterministically.
   */
  now(): number {
    return this.#now();
  }

  reset(): void {
    this.#windows.clear();
    this.#patterns.clear();
  }

  /**
   * Diagnostic-only view: return the per-user counts for a given pattern id.
   * Not part of the `BehavioralPatternDetector` contract — used by the demo
   * admin route and tests to show graduation evidence.
   */
  perUserCounts(pattern_id: string): ReadonlyMap<UserId, number> {
    const hash = pattern_id.startsWith('seq_') ? pattern_id.slice(4) : pattern_id;
    const bucket = this.#patterns.get(hash);
    return bucket ? new Map(bucket.perUser) : new Map();
  }

  /**
   * Diagnostic-only view: capability-id chain for a given pattern id.
   * Used by the admin route to render the proposed recipe.
   */
  capabilitiesFor(pattern_id: string): readonly string[] {
    const hash = pattern_id.startsWith('seq_') ? pattern_id.slice(4) : pattern_id;
    const bucket = this.#patterns.get(hash);
    return bucket ? [...bucket.capabilities] : [];
  }
}

/**
 * Internal helper exported for tests — exposes the deterministic hash so
 * specs can assert collision-safety without poking at private state.
 */
export const __sequenceDetectorInternals = {
  hashSequence,
  fnv1a,
  SEQUENCE_DELIMITER,
};
