// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
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

import type { Capability, ConfirmationLevel } from '@cir/schemas';
import type { ActionExecutionContext } from './dispatcher.js';

export interface ConfirmationRequest {
  capability: Capability;
  level: ConfirmationLevel;
  input: unknown;
  ctx: ActionExecutionContext;
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
