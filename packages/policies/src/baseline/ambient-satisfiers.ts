// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Prebuilt `AmbientPolicySatisfier` declarations for the two runtime
 * services hosts most often mount: `<UndoToast>` at the app root and a
 * `<RateLimitChip>` (or `<RateLimitStatusBar>`) in the chrome.
 *
 * Hosts assemble their `ambient_policy_satisfiers` array from these
 * constants (or from `*Satisfier()` factory helpers when scoping to a
 * specific capability subset). The declarations are surfaced to the
 * policy engine via `PolicyContext.ambient_policy_satisfiers`.
 *
 * Per `docs/ethos.md` principle #4 — runtime services declare the
 * obligations they satisfy; the validator queries the host instead of
 * walking the manifest tree for off-screen anchor nodes.
 */

import type { AmbientPolicySatisfier } from '../result.js';

/**
 * `<UndoToast>` mounted at the app root. The toast surfaces an undo
 * affordance for any reversible capability the dispatcher fires while it
 * is mounted, regardless of what route the user is on. Covers every
 * capability the `reversibility_surfaced` policy would otherwise check.
 */
export const UNDO_TOAST_AMBIENT_SATISFIER: AmbientPolicySatisfier = Object.freeze({
  policyId: 'reversibility_surfaced',
  satisfies: 'all',
});

/**
 * `<RateLimitChip>` (or any equivalent quota indicator) rendered in the
 * chrome and bound to a `*.rate_limit` data source. The chip surfaces
 * remaining quota on every route, satisfying
 * `rate_limited_actions_show_state` for every rate-limited capability the
 * app exposes.
 *
 * Use the factory form `rateLimitChipSatisfier([ids])` when the chip is
 * scoped to a subset of the rate-limited capabilities (e.g. a per-API chip
 * that only covers `github.api.*`).
 */
export const RATE_LIMIT_CHIP_AMBIENT_SATISFIER: AmbientPolicySatisfier = Object.freeze({
  policyId: 'rate_limited_actions_show_state',
  satisfies: 'all',
});

/**
 * Scope a `<RateLimitChip>` declaration to a specific list of capability
 * ids. Useful when the host mounts multiple chips for different APIs.
 */
export function rateLimitChipSatisfier(capabilityIds: readonly string[]): AmbientPolicySatisfier {
  return {
    policyId: 'rate_limited_actions_show_state',
    satisfies: capabilityIds.map((id) => ({ capabilityId: id })),
  };
}

/**
 * Scope an `<UndoToast>` declaration to a specific list of capability
 * ids. Rare — most apps mount a single ambient toast that covers
 * everything — but useful when the toast is gated to a subtree.
 */
export function undoToastSatisfier(capabilityIds: readonly string[]): AmbientPolicySatisfier {
  return {
    policyId: 'reversibility_surfaced',
    satisfies: capabilityIds.map((id) => ({ capabilityId: id })),
  };
}

/**
 * Test helper — returns true iff `satisfiers` covers `capabilityId` for
 * `policyId`. Policies use this to short-circuit per-action checks. A
 * satisfier with `satisfies: 'all'` matches every capability id; the
 * array form matches by exact capability id.
 *
 * Empty / undefined satisfier list ⇒ no coverage. The policy then falls
 * through to its existing manifest-level evidence search.
 */
export function ambientCovers(
  satisfiers: readonly AmbientPolicySatisfier[] | undefined,
  policyId: string,
  capabilityId: string,
): boolean {
  if (!satisfiers || satisfiers.length === 0) return false;
  for (const s of satisfiers) {
    if (s.policyId !== policyId) continue;
    if (s.satisfies === 'all') return true;
    for (const entry of s.satisfies) {
      if (entry.capabilityId === capabilityId) return true;
    }
  }
  return false;
}
