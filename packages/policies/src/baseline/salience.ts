// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 7 / P-9 — categorical salience.
 *
 * Information hierarchy as a first-class data field. The compiler does not
 * need to reason about "which item should I emphasise"; the data resolver
 * stamps `emphasis: 'high'` on rows whose source capability resolves to
 * high salience, and `<Queue>` / `<List>` / `<Grid>` / `<Table>` honour the
 * field via `data-emphasis` on the rendered row.
 *
 * Resolution flow:
 *   1. Each capability MAY declare `salience_level: 'high' | 'normal' | 'low'`.
 *      Capabilities without a level default to `'normal'`.
 *   2. The user's `IntentProfile.priority_overrides` MAY include glob-keyed
 *      overrides. The first override whose `capability_pattern` matches the
 *      capability's id wins.
 *   3. The resolver helper `resolveSalience(capability, intent)` is the
 *      single source of truth — every consumer (this policy, the prompt
 *      nudge, the data resolver, the host) uses it.
 *
 * The companion policy `salience_resolved` is `info`-severity (advisory).
 * Hosts that ignore salience get a remediation prompt, never a hard fail —
 * salience is a polish dimension, not a correctness gate. The error budget
 * for salience misses lives in author judgement, not in the compiler.
 */

import type { Capability, IntentProfile, LayoutNode } from '@atelier/schemas';
import type { NamedPolicy, PolicyResult, PolicyViolation } from '../result.js';
import { walkManifest } from '../internal/walk-layout.js';

/** The categorical salience levels. */
export type SalienceLevel = 'high' | 'normal' | 'low';

/** Default salience when neither capability nor intent specifies a level. */
export const DEFAULT_SALIENCE_LEVEL: SalienceLevel = 'normal';

/**
 * Compile a glob pattern over capability ids into a regular expression.
 *
 * Pattern syntax (kept narrow on purpose so author intent is unambiguous):
 *   - `*`  — matches a single id segment (alphanumeric + `_` + `-`).
 *   - `**` — matches any character including `.` (zero or more).
 *   - Any other character is literal; the `.` separator is significant.
 *
 * Examples:
 *   - `github.issue.*` matches `github.issue.list`, NOT `github.issue.list.foo`.
 *   - `github.**` matches `github.issue.list` AND `github.issue.events`.
 *   - `*.create_from_*` matches `task.create_from_email`.
 *
 * Patterns are anchored at both ends; the matcher does not allow partial
 * matches. An invalid pattern (one whose regex would never compile) returns
 * a regex that never matches, on the principle that a typo should silently
 * miss rather than throw at resolution time.
 */
export function matchCapabilityGlob(pattern: string, capabilityId: string): boolean {
  // Replace `**` with a sentinel BEFORE the single-* expansion so we don't
  // double-quote the second `*`. Then escape regex specials, restore the
  // single-`*` and `**` placeholders to their regex equivalents.
  const escaped = pattern
    .replaceAll('**', '') // sentinel for any-incl-dot
    .replaceAll('*', '') // sentinel for one-segment
    .replaceAll(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('', '.*')
    .replaceAll('', '[A-Za-z0-9_-]+');
  try {
    const re = new RegExp(`^${escaped}$`);
    return re.test(capabilityId);
  } catch {
    return false;
  }
}

/**
 * Resolve the effective salience level for a capability under a user's
 * intent profile.
 *
 * Precedence (first match wins):
 *   1. The first `priority_overrides` rule whose `capability_pattern`
 *      matches `capability.id`.
 *   2. The capability's own `salience_level`.
 *   3. `'normal'` (the framework default).
 *
 * `intent` accepts either a full `IntentProfile` or a slice carrying just
 * `priority_overrides` — the resolver only reads that field, so callers do
 * not need a fully-populated profile.
 */
export function resolveSalience(
  capability: Pick<Capability, 'id' | 'salience_level'>,
  intent: Pick<IntentProfile, 'priority_overrides'> | undefined,
): SalienceLevel {
  const overrides = intent?.priority_overrides;
  if (overrides) {
    for (const rule of overrides) {
      if (matchCapabilityGlob(rule.capability_pattern, capability.id)) {
        return rule.salience;
      }
    }
  }
  return capability.salience_level ?? DEFAULT_SALIENCE_LEVEL;
}

// -----------------------------------------------------------------------------
// `salience_resolved` — advisory policy
// -----------------------------------------------------------------------------

const POLICY_ID = 'salience_resolved';

/**
 * Components that can faithfully render the per-row `emphasis` flag the
 * data resolver stamps for high-salience bindings. Adding a component to
 * this set is a structural promise: the renderer must surface
 * `data-emphasis` on each row (or an equivalent visual treatment).
 *
 * `Queue` / `List` already carry the contract today; `Grid` and `Table`
 * are listed for the same reason. Custom bindings whose
 * `compositionRole` is one of `'list' | 'grid' | 'table'` are also
 * accepted (host registers the role via `PolicyContext.composition_roles`).
 */
const SALIENCE_AWARE_COMPONENTS: ReadonlySet<string> = new Set(['Queue', 'List', 'Grid', 'Table']);

/**
 * Composition roles that count as salience-aware. Mirrors the long-list
 * policy's `LONG_LIST_ROLES` — a custom `<IssueQueue compositionRole='list'>`
 * is structurally equivalent to a bare `<List>` for this policy.
 */
const SALIENCE_AWARE_ROLES: ReadonlySet<string> = new Set(['list', 'grid', 'table']);

/** Read the `source` field from a `data` binding. */
function dataSource(node: LayoutNode): string | undefined {
  const src = (node.data as { source?: unknown } | undefined)?.source;
  return typeof src === 'string' ? src : undefined;
}

export const salienceResolved: NamedPolicy = {
  id: POLICY_ID,
  description:
    'Capabilities whose effective salience resolves to "high" should be bound to a salience-aware component (Queue, List, Grid, Table) so the data resolver can emit per-row emphasis. Advisory: hosts that ignore salience get a hint, not a failure.',
  applies_to: 'manifest',
  severity: 'info',
  evaluate(ctx): PolicyResult {
    const violations: PolicyViolation[] = [];
    const overrides = (ctx.intent as { priority_overrides?: IntentProfile['priority_overrides'] })
      .priority_overrides;
    const intentSlice: Pick<IntentProfile, 'priority_overrides'> = {
      ...(overrides !== undefined ? { priority_overrides: overrides } : {}),
    };
    const roles = ctx.composition_roles;

    walkManifest(ctx.manifest, (node, path) => {
      const sourceId = dataSource(node);
      if (!sourceId) return;
      const cap = ctx.capabilities[sourceId];
      if (!cap) return;
      const level = resolveSalience(cap, intentSlice);
      if (level !== 'high') return;

      // High salience: the rendering component must be salience-aware so
      // the per-row emphasis flag has somewhere to land.
      const role = roles?.[node.component];
      const isSalienceAware =
        SALIENCE_AWARE_COMPONENTS.has(node.component) ||
        (role !== undefined && SALIENCE_AWARE_ROLES.has(role));
      if (isSalienceAware) return;

      violations.push({
        policy_id: POLICY_ID,
        severity: 'info',
        message: `${node.component} at ${path} binds high-salience capability "${sourceId}" but is not a salience-aware component (Queue, List, Grid, or Table). The per-row emphasis the resolver emits will have no visual surface.`,
        path,
        hint: 'Bind the high-salience capability to a Queue / List / Grid / Table, OR register the custom component with composition_roles: { <id>: "list" | "grid" | "table" } so the policy treats it as salience-aware.',
      });
    });

    return { ok: violations.length === 0, violations };
  },
};
