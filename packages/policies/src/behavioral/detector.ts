// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Behavioral pattern detector — the Phase 4 plug-point.
 *
 * The runtime observes user actions across turns. When it sees a workaround
 * pattern repeat (see `/Users/vid/cir/docs/triggers.md` §"Behavioral triggers"),
 * it emits a `behavior.workaround_detected` trigger so the compiler can
 * propose a recompile or a new capability.
 *
 * This module declares the contract; the runtime implements detection. We
 * also ship a no-op reference implementation (`NoopBehavioralDetector`) for
 * tests and for non-runtime contexts where detection is unnecessary.
 *
 * Detection logic deliberately does NOT live here — see ETHOS principle 7
 * ("the render runtime is dumb on purpose") and the Phase 4 hand-off note
 * in the package README.
 */

import type { AppId, ManifestId, Trigger, UserId } from '@cir/schemas';

/**
 * A single observed user action. The detector receives a stream of these
 * from the runtime's action dispatcher. Note `args_fingerprint` is a HASH
 * of the action input, not the input itself — behavioral detection MUST NOT
 * persist raw inputs (privacy / audit constraint).
 */
export interface ObservedAction {
  user_id: UserId;
  app_id: AppId;
  manifest_id?: ManifestId;
  capability_id: string;
  /** Hash of the action input — never the raw input. */
  args_fingerprint: string;
  /** ISO 8601 datetime of the observation. */
  occurred_at: string;
}

/** A pattern the detector has identified. */
export interface DetectedPattern {
  pattern_id: string;
  description: string;
  occurrences: number;
  proposed_capability?: string;
  /** Route paths the compiler should recompile if the user accepts the suggestion. */
  proposed_recompile?: string[];
}

/**
 * The plug-point. The Phase 4 runtime provides an implementation; everything
 * outside the runtime that needs to interact with detection should depend on
 * this interface, never on a concrete class.
 */
export interface BehavioralPatternDetector {
  /** Feed an observed action to the detector. */
  observe(action: ObservedAction): void;
  /** Snapshot patterns the detector currently believes warrant action. */
  snapshot(): readonly DetectedPattern[];
  /** Convert a detected pattern into a `Trigger` event for the bus. */
  toTrigger(pattern: DetectedPattern): Trigger;
  /** Clear observed state (e.g. after a recompile is acknowledged). */
  reset(): void;
}

/**
 * Reference no-op detector. Useful for tests and as the default in non-
 * runtime contexts (e.g. CLI compilers, eval harnesses) where detection is
 * out of scope.
 *
 * Calling `toTrigger` throws — there are never patterns to convert from a
 * no-op detector, so a trigger emission is always a programming error.
 */
export const NoopBehavioralDetector: BehavioralPatternDetector = {
  observe(): void {
    // intentionally no-op
  },
  snapshot(): readonly DetectedPattern[] {
    return [];
  },
  toTrigger(): Trigger {
    throw new Error('NoopBehavioralDetector cannot emit triggers');
  },
  reset(): void {
    // intentionally no-op
  },
};
