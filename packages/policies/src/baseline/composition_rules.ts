// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Policy: `composes_according_to_rules`
 *
 * Walks every layout node in the manifest and checks each component against
 * the catalog's composition rules. A `CompositionRule` per component answers:
 *
 *   - `can_contain: '*'`     — any component allowed as a child
 *   - `can_contain: 'leaf'`  — no children allowed
 *   - `can_contain: ['X','Y']` — only the listed components allowed
 *   - `min_children` / `max_children` — bounded child counts
 *
 * Why a factory? Composition rules are app-specific. Each app declares its
 * own component catalog (the baseline catalog ships with `@cir/components`,
 * but downstream apps add custom components like `DecisionQueue`). The
 * factory takes the rules and returns a `NamedPolicy` an app can drop into
 * its policy list:
 *
 *     import { COMPOSITION_RULES } from '@cir/components';
 *     const policies = [...BASELINE_POLICIES, composesAccordingTo(COMPOSITION_RULES)];
 *
 * Components not present in the rule map are skipped — the runtime renders
 * them via fallback and we don't claim authority over them.
 */

import type { NamedPolicy, PolicyViolation } from '../result.js';
import { walkManifest } from '../internal/walk-layout.js';

/**
 * One composition rule keyed by component id.
 *
 * `'*'` allows any child component.
 * `'leaf'` is a sentinel meaning "no children". It is distinct from `'*'`
 * (which permits anything including zero children).
 * An explicit array lists the only component ids that may appear as children.
 */
export interface CompositionRule {
  can_contain: '*' | 'leaf' | readonly string[];
  min_children?: number;
  max_children?: number;
}

/** Map of component id → composition rule. */
export type CompositionRules = Record<string, CompositionRule>;

const POLICY_ID = 'composes_according_to_rules';

/** Maps a `compositionRole` to the baseline component id whose rules apply. */
const ROLE_TO_BASELINE: Readonly<Record<'list' | 'grid' | 'table', string>> = Object.freeze({
  list: 'List',
  grid: 'Grid',
  table: 'Table',
});

/**
 * Factory — apps configure the rule set their compiler/runtime knows about.
 * Returns a `NamedPolicy` that can be added to the policy list.
 *
 * When a `composition_roles` map is supplied on `PolicyContext`, custom
 * components are resolved through that map onto a baseline rule (e.g.
 * `compositionRole: 'grid'` reuses the `Grid` rule). This keeps demos that
 * register a `<ProductGrid>` from having to duplicate the entire rule set.
 */
export function composesAccordingTo(rules: CompositionRules): NamedPolicy {
  return {
    id: POLICY_ID,
    description: "Component children must satisfy the catalog's composition rules.",
    applies_to: 'manifest',
    severity: 'error',
    evaluate(ctx) {
      const violations: PolicyViolation[] = [];
      walkManifest(ctx.manifest, (node, path) => {
        let rule = rules[node.component];
        if (!rule && ctx.composition_roles) {
          const role = ctx.composition_roles[node.component];
          if (role) {
            const baseline = ROLE_TO_BASELINE[role];
            rule = rules[baseline];
          }
        }
        if (!rule) return; // unknown component — skip; runtime renders fallback

        const children = node.children ?? [];

        // Min/max children bounds first — apply regardless of `can_contain`
        // shape (a leaf with min_children would be a misconfigured rule, but
        // we still emit clear errors rather than masking).
        if (rule.min_children !== undefined && children.length < rule.min_children) {
          violations.push({
            policy_id: POLICY_ID,
            severity: 'error',
            message: `Component "${node.component}" requires at least ${String(rule.min_children)} children; got ${String(children.length)}.`,
            path: `${path}/children`,
          });
        }
        if (rule.max_children !== undefined && children.length > rule.max_children) {
          violations.push({
            policy_id: POLICY_ID,
            severity: 'error',
            message: `Component "${node.component}" allows at most ${String(rule.max_children)} children; got ${String(children.length)}.`,
            path: `${path}/children`,
          });
        }

        // Allowed-children check.
        if (rule.can_contain === 'leaf') {
          if (children.length > 0) {
            violations.push({
              policy_id: POLICY_ID,
              severity: 'error',
              message: `Component "${node.component}" is a leaf and cannot have children.`,
              path: `${path}/children`,
            });
          }
        } else if (Array.isArray(rule.can_contain)) {
          for (let i = 0; i < children.length; i++) {
            const child = children[i]!;
            if (!rule.can_contain.includes(child.component)) {
              violations.push({
                policy_id: POLICY_ID,
                severity: 'error',
                message: `Component "${node.component}" cannot contain "${child.component}". Allowed: [${rule.can_contain.join(', ')}].`,
                path: `${path}/children/${String(i)}`,
              });
            }
          }
        }
        // `'*'` allows any child — no further check needed.
      });
      return { ok: violations.length === 0, violations };
    },
  };
}
