// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Policy: `reversibility_surfaced`
 *
 * For every action surfaced in the manifest:
 *  - If the capability is `reversible: true`, assert the manifest also
 *    surfaces an undo affordance for it: a `Button` or `ActionMenu` whose
 *    `actions` includes the capability's `rollback`, OR an `Undo` ambient
 *    affordance anywhere in the same route's layout. (`error` severity.)
 *  - If the capability is destructive AND `reversible: false`, emit a
 *    `warn`-severity violation so designers see it. The manifest still
 *    compiles — non-reversible mutations are not forbidden, just flagged.
 *
 * Source spec: `/Users/vid/cir/docs/architecture.md` §"Policy engine":
 *
 *     for each non-trivial mutation:
 *       assert manifest surfaces an undo affordance
 *
 * ETHOS principle 8: "Reversibility is a primitive, not a feature."
 */

import type { LayoutNode, Manifest } from '@cir/schemas';
import type { NamedPolicy, PolicyResult, PolicyViolation } from '../result.js';
import { walkManifest } from '../internal/walk-layout.js';
import { DESTRUCTIVE_SIDE_EFFECTS } from './confirmation_required_for_destructive.js';

const POLICY_ID = 'reversibility_surfaced';

/** Components recognized as undo affordances. */
const UNDO_COMPONENT_NAMES: ReadonlySet<string> = new Set(['Undo', 'UndoBar', 'UndoToast']);

/** Components that, when carrying a rollback action, count as an undo affordance. */
const UNDO_HOST_COMPONENTS: ReadonlySet<string> = new Set(['Button', 'ActionMenu', 'IconButton']);

function collectRoutesWithLayout(manifest: Manifest): Array<{ idx: number; layout: LayoutNode }> {
  return manifest.routes
    .map((r, idx) => (r.layout ? { idx, layout: r.layout } : null))
    .filter((x): x is { idx: number; layout: LayoutNode } => x !== null);
}

function subtreeContainsUndoFor(rollback: string, root: LayoutNode): boolean {
  const stack: LayoutNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (UNDO_COMPONENT_NAMES.has(node.component)) return true;
    if (
      UNDO_HOST_COMPONENTS.has(node.component) &&
      Array.isArray(node.actions) &&
      node.actions.includes(rollback)
    ) {
      return true;
    }
    if (node.children) stack.push(...node.children);
  }
  return false;
}

export const reversibilitySurfaced: NamedPolicy = {
  id: POLICY_ID,
  description:
    'Reversible actions surface an undo affordance in the same route; non-reversible destructive actions are flagged for review.',
  applies_to: 'manifest',
  severity: 'error',
  evaluate(ctx): PolicyResult {
    const violations: PolicyViolation[] = [];
    const routes = collectRoutesWithLayout(ctx.manifest);

    walkManifest(ctx.manifest, (node, path) => {
      if (!node.actions || node.actions.length === 0) return;

      // Resolve which route this node belongs to so we can scope undo lookup.
      const routeMatch = path.match(/^\/routes\/(\d+)\//);
      const routeIdx = routeMatch?.[1] ? Number(routeMatch[1]) : -1;
      const routeLayout = routes.find((r) => r.idx === routeIdx)?.layout;

      node.actions.forEach((actionId, actionIdx) => {
        const capability = ctx.capabilities[actionId];
        if (!capability) return; // confirmation policy already reports this

        const isMutating = capability.side_effects.some((s) => DESTRUCTIVE_SIDE_EFFECTS.has(s));

        if (capability.reversible) {
          const rollback = capability.rollback;
          if (!rollback) {
            // Capability says reversible but did not declare its rollback;
            // we cannot find an affordance keyed to a missing ID.
            violations.push({
              policy_id: POLICY_ID,
              severity: 'error',
              message: `Action "${actionId}" is reversible but its capability does not declare a \`rollback\` ID.`,
              path: `${path}/actions/${actionIdx}`,
              hint: 'Declare `rollback: <inverse capability id>` on the capability so the runtime can wire undo.',
            });
            return;
          }
          const hasUndo = routeLayout ? subtreeContainsUndoFor(rollback, routeLayout) : false;
          if (!hasUndo) {
            violations.push({
              policy_id: POLICY_ID,
              severity: 'error',
              message: `Reversible action "${actionId}" has no undo affordance for rollback "${rollback}" in this route.`,
              path: `${path}/actions/${actionIdx}`,
              hint: `Add a Button/ActionMenu invoking "${rollback}", or an Undo/UndoBar/UndoToast component in the same route layout.`,
            });
          }
        } else if (isMutating) {
          violations.push({
            policy_id: POLICY_ID,
            severity: 'warn',
            message: `Action "${actionId}" is destructive (side_effects: ${capability.side_effects.join(', ')}) and not reversible.`,
            path: `${path}/actions/${actionIdx}`,
            hint: 'Consider adding a reversible inverse, or confirm with the user that no undo is acceptable.',
          });
        }
      });
    });

    return {
      ok: violations.length === 0,
      violations,
    };
  },
};
