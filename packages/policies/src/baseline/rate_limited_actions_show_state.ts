// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Policy: `rate_limited_actions_show_state`
 *
 * For every action whose capability is rate-limited (its ID is in
 * `ctx.rate_limited_capability_ids`), assert the manifest exposes the
 * remaining quota somewhere in the layout that owns the action.
 *
 * Source spec: `/Users/vid/cir/docs/architecture.md` §"Policy engine":
 *
 *     for each rate-limited action:
 *       assert manifest exposes remaining quota to user
 *
 * Heuristic: there is a layout node — the action node itself, a sibling
 * within the same parent, or any ancestor — whose `data.source` ends with
 * `.quota`, `.rate_limit`, or `.usage`. Component name does not need to be
 * specific (we don't enforce a `RateMeter` component because not every host
 * has one), but the presence of a quota-providing data source is required.
 *
 * **Ambient satisfaction** (Phase 2 #5 / `docs/ethos.md` principle #4): a
 * host that mounts a `<RateLimitChip>` (or equivalent) in the chrome can
 * declare it via `PolicyContext.ambient_policy_satisfiers`. The chip lives
 * on every route in the rendered DOM regardless of the manifest tree;
 * declaring it as a satisfier eliminates the need for invisible quota
 * "anchor" nodes in every route's manifest.
 *
 * This is intentionally a `warn` rather than `error`: the heuristic is fuzzy
 * (a quota might be presented as a custom prop fed in from elsewhere). Better
 * to surface for designer review than reject the manifest.
 */

import type { LayoutNode } from '@atelier/schemas';
import type { NamedPolicy, PolicyResult, PolicyViolation } from '../result.js';
import { walkManifest } from '../internal/walk-layout.js';
import { ambientCovers } from './ambient-satisfiers.js';

const POLICY_ID = 'rate_limited_actions_show_state';

const QUOTA_SUFFIXES = ['.quota', '.rate_limit', '.usage'] as const;

function isQuotaSource(source: string | undefined): boolean {
  if (!source) return false;
  return QUOTA_SUFFIXES.some((suffix) => source.endsWith(suffix));
}

/**
 * Recursively scan a subtree for a quota data source. Used to check siblings
 * and self.
 */
function subtreeHasQuotaSource(node: LayoutNode): boolean {
  if (isQuotaSource(node.data?.source)) return true;
  if (node.children) {
    for (const child of node.children) {
      if (subtreeHasQuotaSource(child)) return true;
    }
  }
  return false;
}

export const rateLimitedActionsShowState: NamedPolicy = {
  id: POLICY_ID,
  description:
    'Layouts that dispatch rate-limited actions surface the remaining quota (a sibling or ancestor binds a `*.quota`, `*.rate_limit`, or `*.usage` data source).',
  applies_to: 'manifest',
  severity: 'warn',
  evaluate(ctx): PolicyResult {
    const violations: PolicyViolation[] = [];
    const limited = ctx.rate_limited_capability_ids;
    if (limited.size === 0) return { ok: true, violations };

    walkManifest(ctx.manifest, (node, path, ancestors) => {
      if (!node.actions || node.actions.length === 0) return;

      // Does any ancestor expose a quota directly?
      const ancestorHasQuota = ancestors.some((a) => isQuotaSource(a.data?.source));
      if (ancestorHasQuota) return;

      // Does the node's own subtree (including itself) have one? Or any
      // sibling subtree under the closest ancestor?
      const selfOrSubtree = subtreeHasQuotaSource(node);
      const parent = ancestors.at(-1);
      const siblingsHaveQuota =
        parent?.children?.some((sibling) => sibling !== node && subtreeHasQuotaSource(sibling)) ??
        false;

      if (selfOrSubtree || siblingsHaveQuota) return;

      // No quota visible in the manifest tree: fall back to ambient
      // satisfaction. A host with a `<RateLimitChip>` in the chrome
      // declares it as an ambient satisfier; per-action coverage clears
      // the obligation without an in-manifest quota node.
      node.actions.forEach((actionId, actionIdx) => {
        if (!limited.has(actionId)) return;
        if (ambientCovers(ctx.ambient_policy_satisfiers, POLICY_ID, actionId)) return;
        violations.push({
          policy_id: POLICY_ID,
          severity: 'warn',
          message: `Rate-limited action "${actionId}" is exposed without a visible quota indicator.`,
          path: `${path}/actions/${actionIdx}`,
          hint: 'Bind a sibling or ancestor component to a data source whose name ends with `.quota`, `.rate_limit`, or `.usage`, OR declare an ambient `<RateLimitChip>` via `PolicyContext.ambient_policy_satisfiers` (passed to `validateManifest` from the host).',
        });
      });
    });

    return {
      ok: violations.length === 0,
      violations,
    };
  },
};
