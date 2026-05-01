// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Policy: `composes_hierarchy_for_long_lists`
 *
 * Long lists ("more than 7 items above the fold") become a wall of equally-
 * weighted rows unless the manifest signals which rows matter most. This
 * policy fires whenever a `<List>` / `<Table>` / `<Grid>` is bound to a
 * capability that declares a `salience_default` AND the binding's expected
 * cardinality exceeds 7. The manifest must then take ONE of the following
 * shapes:
 *
 *   1. Set `props.density: 'compact'` — the author is acknowledging the list
 *      is long and is owning the consequences (reduced affordance per row).
 *   2. Add `props.emphasizeTopN: <number ≥ 1>` — explicit emphasis on the
 *      top N items via a hierarchy treatment the renderer applies.
 *   3. Wrap the binding in a `Stack` with a `<KPIRow>` summary above — the
 *      KPIRow surfaces the salient signals before the long list renders.
 *   4. Reference a manifest-resolved row factory via `row_binding: 'X'` —
 *      the row component (e.g. `<ProductCard>`) carries the hierarchy
 *      itself (image + price emphasis + secondary metadata), so the row
 *      composition substitutes for the structural emphasis primitives.
 *      This is the alternative to the `compositionRole` escape hatch on
 *      custom container bindings: a baseline `<Grid>` can satisfy the
 *      policy by naming a rich row in the manifest.
 *
 * Manifests that satisfy NONE of these get a `warn`-level violation. The
 * severity is `warn` (not `error`) because the cardinality check is
 * heuristic — it relies on either (a) an inline `expected_count` /
 * `cardinality` hint on the data binding, or (b) the binding having been
 * compiled against capabilities ranges. Without an explicit hint the policy
 * assumes the list is long whenever a `salience_default` is present (the
 * capability author signalled "this can produce many items"). False positives
 * are tolerable at `warn` severity — the `composes_according_to_rules` policy
 * (severity `error`) handles the strict cases.
 *
 * Source: Wave 7b / track P-9 — the information-hierarchy skill
 * (`skills/information-hierarchy.skill.md`) and the new
 * `Capability.salience_default` field.
 */

import type { LayoutNode } from '@cir/schemas';
import type { NamedPolicy, PolicyResult, PolicyViolation } from '../result.js';
import { walkManifest } from '../internal/walk-layout.js';

const POLICY_ID = 'composes_hierarchy_for_long_lists';

/** Components the policy considers "long-list-ish" — same set as the skill. */
const LONG_LIST_COMPONENTS: ReadonlySet<string> = new Set(['List', 'Table', 'Grid']);

/**
 * Roles that count as long-list-ish for the role-driven extension. A host
 * can register a custom component (e.g. `<IssueQueue>`) under one of these
 * roles via `PolicyContext.composition_roles`; this policy then evaluates
 * it identically to the baseline component of that role. Kept narrow on
 * purpose — a `'kpi'` role would NOT trigger this policy.
 */
const LONG_LIST_ROLES: ReadonlySet<string> = new Set(['list', 'table', 'grid']);

/** Default cardinality threshold above which hierarchy treatment is required. */
const HIERARCHY_THRESHOLD = 7;

/**
 * Try to read an inline cardinality hint from the data binding. We accept
 * `expected_count`, `cardinality`, or `expected_cardinality` as integer
 * fields on either the binding itself or the node's `props`. Returns
 * `undefined` when the hint is missing — callers fall back to the
 * "salience_default implies long" heuristic.
 */
function expectedCardinality(node: LayoutNode): number | undefined {
  const candidates: ReadonlyArray<unknown> = [
    (node.data as Record<string, unknown> | undefined)?.['expected_count'],
    (node.data as Record<string, unknown> | undefined)?.['cardinality'],
    (node.data as Record<string, unknown> | undefined)?.['expected_cardinality'],
    node.props?.['expectedCount'],
    node.props?.['cardinality'],
    node.props?.['expectedCardinality'],
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return c;
  }
  return undefined;
}

/** True if `node.props.density === 'compact'`. */
function isCompact(node: LayoutNode): boolean {
  return node.props?.['density'] === 'compact';
}

/** True if `node.props.emphasizeTopN` is a positive integer. */
function declaresEmphasis(node: LayoutNode): boolean {
  const v = node.props?.['emphasizeTopN'];
  return typeof v === 'number' && Number.isFinite(v) && v >= 1;
}

/**
 * True if the node references a manifest-resolved row factory. A rich row
 * binding (e.g. `<ProductCard>`) carries the hierarchy treatment internally
 * — emphasis price, image, secondary metadata — so a baseline `<Grid>` /
 * `<List>` / `<Table>` with `row_binding` set is structurally equivalent
 * to a custom binding declaring a `compositionRole`. Either path satisfies
 * the policy; this one keeps the container generic.
 */
function declaresRowBinding(node: LayoutNode): boolean {
  return typeof node.row_binding === 'string' && node.row_binding.length > 0;
}

/**
 * True if `node` lives under a `Stack` whose siblings include a `KPIRow`.
 * We treat any `KPIRow` child of the nearest `Stack` ancestor as "summary
 * above" for the purposes of this heuristic. `node` itself is not
 * inspected — only its position relative to a Stack-with-KPIRow ancestor.
 */
function summarisedByKPIRow(ancestors: readonly LayoutNode[]): boolean {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const anc = ancestors[i];
    if (!anc || anc.component !== 'Stack' || !anc.children) continue;
    const hasKPIRow = anc.children.some((c) => c.component === 'KPIRow');
    if (hasKPIRow) return true;
  }
  return false;
}

export const composesHierarchyForLongLists: NamedPolicy = {
  id: POLICY_ID,
  description:
    'Long-cardinality List / Table / Grid bindings whose capability declares salience_default must declare hierarchy treatment (compact density, emphasizeTopN, or a KPIRow summary).',
  applies_to: 'manifest',
  severity: 'warn',
  evaluate(ctx): PolicyResult {
    const violations: PolicyViolation[] = [];

    const roles = ctx.composition_roles;

    walkManifest(ctx.manifest, (node, path, ancestors) => {
      // Baseline ids OR a host-registered custom binding whose role is
      // long-list-ish. The role check is the role-driven extension: a
      // custom `<IssueQueue compositionRole="list">` is policy-equivalent
      // to a bare `<List>` here.
      const role = roles?.[node.component];
      const isLongListShape =
        LONG_LIST_COMPONENTS.has(node.component) ||
        (role !== undefined && LONG_LIST_ROLES.has(role));
      if (!isLongListShape) return;
      if (!node.data) return; // No data binding — no obligation.

      // Resolve the bound capability via the data source field. Bindings
      // shape: `{ source: '<capability.id>', ... }`.
      const sourceId = (node.data as { source?: unknown }).source;
      if (typeof sourceId !== 'string') return;
      const cap = ctx.capabilities[sourceId];
      if (!cap || !cap.salience_default) return; // Capability doesn't declare salience — skip.

      // Determine whether the binding is long enough to warrant hierarchy.
      // If an explicit hint is present, use it. Otherwise, the presence of
      // `salience_default` + the long-list component is the heuristic.
      const card = expectedCardinality(node);
      const longEnough = card === undefined ? true : card > HIERARCHY_THRESHOLD;
      if (!longEnough) return;

      const ok =
        isCompact(node) ||
        declaresEmphasis(node) ||
        declaresRowBinding(node) ||
        summarisedByKPIRow(ancestors);
      if (ok) return;

      violations.push({
        policy_id: POLICY_ID,
        severity: 'warn',
        message: `${node.component} at ${path} binds a long-cardinality list (capability "${sourceId}" declares salience_default) but lacks hierarchy treatment.`,
        path,
        hint: "Set props.density: 'compact', add props.emphasizeTopN >= 1, set row_binding to a rich row component, or wrap the binding in a Stack with a sibling KPIRow.",
      });
    });

    return { ok: violations.length === 0, violations };
  },
};
