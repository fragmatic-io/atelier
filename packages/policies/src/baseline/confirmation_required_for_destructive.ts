// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Policy: `confirmation_required_for_destructive`
 *
 * For every action a layout node can dispatch, look up the capability and
 * check its `side_effects`. If any side effect is in the destructive set,
 * the layout MUST surface a confirmation: either via a `ConfirmDialog`
 * sibling/ancestor in the layout, or via a `confirmation` prop on the node
 * itself with a value of `modal` | `verbal_required`.
 *
 * AGENTS.md hard rule #5 — confirmation policy is set per capability — and
 * `/Users/vid/cir/docs/architecture.md` §"Policy engine" both motivate this rule.
 *
 * The destructive side-effect list is a subset of `KNOWN_SIDE_EFFECTS` from
 * `@cir/schemas` (`packages/schemas/src/capability.ts`); we re-declare the
 * subset here since not every known side effect is destructive (`mutates:*`
 * and `reads:*` are not, for example).
 */

import type { Capability, LayoutNode } from '@cir/schemas';
import type { NamedPolicy, PolicyResult, PolicyViolation } from '../result.js';
import { walkManifest } from '../internal/walk-layout.js';

const POLICY_ID = 'confirmation_required_for_destructive';

/**
 * Side-effect categories that REQUIRE confirmation. Mirrors the spec note in
 * the package brief, drawn from `KNOWN_SIDE_EFFECTS` in `@cir/schemas`. Update
 * BOTH lists if you add a new destructive category.
 */
export const DESTRUCTIVE_SIDE_EFFECTS: ReadonlySet<string> = new Set([
  'send',
  'publish',
  'post',
  'share',
  'pay',
  'charge',
  'transfer',
  'refund',
  'delete',
  'purge',
  'grant',
  'revoke',
  'modify_permissions',
]);

function isDestructive(capability: Capability): boolean {
  return capability.side_effects.some((s) => DESTRUCTIVE_SIDE_EFFECTS.has(s));
}

/**
 * Read the `confirmation` prop off a layout node, if any. Recognized values
 * are the same ones the capability schema declares: `modal`, `verbal_required`.
 * Anything else (`inline`, `none`, missing) is treated as "no confirmation
 * gate at this node".
 */
function nodeHasConfirmationProp(node: LayoutNode): boolean {
  const value = node.props?.['confirmation'];
  return value === 'modal' || value === 'verbal_required';
}

/**
 * True if `node` itself or any ancestor is a `ConfirmDialog`. The compiler
 * may wrap a destructive action in a dialog at any depth — we accept any.
 */
function hasConfirmDialogAncestor(node: LayoutNode, ancestors: readonly LayoutNode[]): boolean {
  if (node.component === 'ConfirmDialog') return true;
  return ancestors.some((a) => a.component === 'ConfirmDialog');
}

export const confirmationRequiredForDestructive: NamedPolicy = {
  id: POLICY_ID,
  description:
    'Every destructive action surfaced in the manifest is gated by a ConfirmDialog or carries a `confirmation: modal | verbal_required` prop.',
  applies_to: 'action',
  severity: 'error',
  evaluate(ctx): PolicyResult {
    const violations: PolicyViolation[] = [];

    walkManifest(ctx.manifest, (node, path, ancestors) => {
      if (!node.actions || node.actions.length === 0) return;
      const gated = nodeHasConfirmationProp(node) || hasConfirmDialogAncestor(node, ancestors);

      node.actions.forEach((actionId, actionIdx) => {
        const capability = ctx.capabilities[actionId];
        if (!capability) {
          violations.push({
            policy_id: POLICY_ID,
            severity: 'error',
            message: `Layout node references unresolved capability "${actionId}" — cannot evaluate confirmation requirement.`,
            path: `${path}/actions/${actionIdx}`,
            hint: 'The compiler must resolve every action capability before policy evaluation.',
          });
          return;
        }

        if (!isDestructive(capability)) return;
        if (gated) return;

        violations.push({
          policy_id: POLICY_ID,
          severity: 'error',
          message: `Destructive action "${actionId}" (side_effects: ${capability.side_effects.join(', ')}) is not gated by a ConfirmDialog or a \`confirmation\` prop.`,
          path: `${path}/actions/${actionIdx}`,
          hint: 'Wrap the action in a ConfirmDialog component, or set props.confirmation to "modal" or "verbal_required" on this node.',
        });
      });
    });

    return {
      ok: violations.length === 0,
      violations,
    };
  },
};
