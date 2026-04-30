// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Composer that runs every policy against a context and aggregates the results.
 *
 * The compiler calls this exactly once per manifest candidate before storing
 * it. See `/Users/vid/cir/docs/architecture.md` §"Cold path" step 6g.
 */

import type { NamedPolicy, PolicyContext, PolicyResult, PolicyViolation } from './result.js';
import { composesHierarchyForLongLists } from './baseline/composes_hierarchy_for_long_lists.js';
import { dataAccessWithinGrant } from './baseline/data_access_within_grant.js';
import { confirmationRequiredForDestructive } from './baseline/confirmation_required_for_destructive.js';
import { emptyLoadingErrorHandled } from './baseline/empty_loading_error_handled.js';
import { noPiiInQueryStrings } from './baseline/no_pii_in_query_strings.js';
import { rateLimitedActionsShowState } from './baseline/rate_limited_actions_show_state.js';
import { respectsBrandKit } from './baseline/respects_brand_kit.js';
import { reversibilitySurfaced } from './baseline/reversibility_surfaced.js';

/**
 * The baseline policies enumerated in `docs/architecture.md` plus
 * `respects_brand_kit` (Phase 5a) and `empty_loading_error_handled` (Wave 7a /
 * P-8). Order matters only for stable violation ordering in audit output —
 * the policies do not depend on each other.
 */
export const BASELINE_POLICIES: readonly NamedPolicy[] = [
  dataAccessWithinGrant,
  confirmationRequiredForDestructive,
  noPiiInQueryStrings,
  rateLimitedActionsShowState,
  reversibilitySurfaced,
  respectsBrandKit,
  emptyLoadingErrorHandled,
  composesHierarchyForLongLists,
];

export interface ValidateOptions {
  /** Override the default baseline. Useful for tests or additive policies. */
  policies?: readonly NamedPolicy[];
  /** Treat warn-severity violations as failures. Default false. */
  strict?: boolean;
}

/**
 * Run every policy in `options.policies` (defaulting to `BASELINE_POLICIES`)
 * and aggregate the violations. `ok` is true iff:
 *  - in normal mode: there are no `error`-severity violations
 *  - in `strict: true` mode: there are no violations at all
 *
 * Each policy runs independently; a thrown exception inside a policy
 * propagates (the compiler is responsible for catching unexpected failures
 * and treating them as compile errors).
 */
export function validateManifest(ctx: PolicyContext, options?: ValidateOptions): PolicyResult {
  const policies = options?.policies ?? BASELINE_POLICIES;
  const strict = options?.strict ?? false;

  const violations: PolicyViolation[] = [];
  for (const policy of policies) {
    const result = policy.evaluate(ctx);
    violations.push(...result.violations);
  }

  const hasError = violations.some((v) => v.severity === 'error');
  const hasAny = violations.length > 0;
  const ok = strict ? !hasAny : !hasError;

  return { ok, violations };
}
