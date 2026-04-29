// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Confirmation flow for action dispatch.
 *
 * AGENTS.md hard rule #5 ("confirmation policy is set per capability") and
 * `/Users/vid/cir/docs/chat/runtime-instructions.md` §"Confirmation rules"
 * specify: every capability with `confirmation: modal | verbal_required`
 * MUST be confirmed before execution. The runtime calls the host's
 * confirmation callback with a `ConfirmationRequest` and proceeds only if
 * the returned `ConfirmationDecision.confirmed` is true.
 *
 * The runtime is policy-strict: if a capability needs `verbal_required` the
 * host's UI is responsible for actually requiring a verbal/typed consent
 * step — the runtime cannot validate that, but it can refuse to execute
 * unless the host says yes.
 */

import type { ConfirmationLevel } from '@cir/schemas';

export interface ConfirmationRequest {
  /** Capability id of the action awaiting confirmation. */
  capability_id: string;
  /** UI hint: what's being asked. */
  prompt: string;
  /** Side-effect summary (capability.side_effects). */
  side_effects: readonly string[];
  /** Confirmation level from the capability. */
  level: 'inline' | 'modal' | 'verbal_required';
  /**
   * For `verbal_required`: phrase the user must type. Default: last segment
   * of capability_id ("pulls.merge" → "merge"). Hosts can override per-call.
   */
  verbal_phrase?: string;
}

export interface ConfirmationDecision {
  confirmed: boolean;
  /** Optional reason; surfaced in `action.denied` audit if `confirmed === false`. */
  reason?: string;
}

export type ConfirmationCallback = (
  req: ConfirmationRequest,
) => Promise<ConfirmationDecision> | ConfirmationDecision;

/** Levels that require a confirm() round-trip. */
const REQUIRED_LEVELS: ReadonlySet<ConfirmationLevel> = new Set(['modal', 'verbal_required']);

export function requiresConfirmation(level: ConfirmationLevel): boolean {
  return REQUIRED_LEVELS.has(level);
}

/**
 * Sentinel callback that auto-confirms anything. Useful in tests; never
 * appropriate for production hosts handling capabilities with destructive
 * side effects.
 */
export const ALWAYS_CONFIRM: ConfirmationCallback = () => ({ confirmed: true });

/** Sentinel callback that auto-declines. Useful for "confirm declined" tests. */
export const ALWAYS_DECLINE: ConfirmationCallback = () => ({
  confirmed: false,
  reason: 'declined-by-test',
});
