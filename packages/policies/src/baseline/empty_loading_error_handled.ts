// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Policy: `empty_loading_error_handled`
 *
 * Every data-bound component in a manifest must declare what to show when its
 * data source is empty, loading, or errored. A "personalised" UI that flashes
 * a blank rectangle on cold load (or stays blank when zero rows come back) is
 * worse than the framework's default UI — it looks broken.
 *
 * Wave 7 / P-8 — empty / loading / error are now first-class composition
 * slots:
 *   - **Schema** (`packages/schemas/src/manifest.ts`): `data.empty_state`,
 *     `data.loading_state`, `data.error_state` are formal `LayoutNode` slots
 *     on `ComponentDataBinding`. Manifests opt in only when they need a
 *     distinctive surface; the resolver pipeline supplies a sensible default
 *     for every state otherwise (ethos principle #9).
 *   - **Runtime**: the React render walker (`packages/react/src/render/
 *     render-node.tsx`) substitutes the manifest's slot — or a host /
 *     framework default — in place of the data-bound component when the
 *     resolver reports `loading | error | empty`. See
 *     `BASELINE_RESOLVER_DEFAULTS` for the framework defaults
 *     (`<EmptyState>` / `<Skeleton>` / `<Alert>`).
 *   - **Policy** (this file): walks the manifest, surfaces an `info`
 *     advisory for every data-bound node that does not declare a custom
 *     slot, and an `error` for bindings that opt into strict state handling
 *     via `requiresExplicitStateSlots`.
 *
 * The policy walks every `LayoutNode`. For each node whose component is in the
 * data-bound allow-list (`List`, `Table`, `Grid`, `KPIRow`, `DetailView`,
 * `Chart`, `Calendar`, `Kanban`, `Timeline`, `Gallery`, `Tree`) and whose node
 * carries a `data` binding, the policy asserts that all three states are
 * handled. A state counts as handled when ANY of these is true:
 *
 *   1. The binding declares the slot inline:
 *        `data.empty_state`, `data.loading_state`, `data.error_state` (a full
 *        `LayoutNode` — typically `EmptyState`, `Spinner`, `Alert`).
 *   2. The node carries the slot in `props`:
 *        `props.emptyState`, `props.loadingState`, `props.errorState`. Free-
 *        form prop value — runtime concern, the policy treats any defined
 *        value as sufficient.
 *   3. A sibling under the nearest ancestor handles the state for it:
 *        `EmptyState` / `Spinner` (or `Skeleton` / `Progress`) / `Alert`
 *        appearing as a sibling of the data-bound node. This covers the
 *        common pattern of a `<Stack>` wrapping a `<List>` and an
 *        `<EmptyState>` together — the runtime cross-fades on load state.
 *
 * If none of the three apply, the policy falls through to the resolver-default
 * path: the React render walker substitutes `BASELINE_RESOLVER_DEFAULTS[kind]`
 * (or the host's `services.resolverDefaults.{empty,loading,error}` override)
 * at render time, tagged with `data-cir-default-state`. The advisory is the
 * remediation prompt for authors who want a per-route distinctive surface.
 *
 * Source spec: `/Users/vid/cir/skills/empty-state-prose.skill.md` ("every
 * `<List>` / `<Grid>` / `<Table>` / `<DetailView>` that binds to a data
 * source that can legitimately return zero rows") and the wider production-
 * concerns doc.
 *
 * Severity (Phase 2 #4 — resolver fallback contract):
 *   - Default `info`. The render walker supplies an `<EmptyState>` /
 *     `<Skeleton>` / `<Alert>` default at runtime when the manifest omits a
 *     slot, so the missing slot is no longer fatal — it is a remediation
 *     prompt for authors who want a custom empty-zero / loading / error UI.
 *   - `error` for components whose `ComponentBinding.requiresExplicitStateSlots`
 *     is true (threaded through `PolicyContext.requires_explicit_state_slots`).
 *     This is the strict opt-in for bindings whose visual identity falls
 *     apart with the generic defaults.
 *
 * Per-violation severity is set on the violation itself; the policy's own
 * `severity` field reports the strictest case (`error`) for back-compat with
 * audit tooling.
 */

import type { LayoutNode } from '@atelier/schemas';
import type { NamedPolicy, PolicyResult, PolicyViolation } from '../result.js';
import { walkManifest } from '../internal/walk-layout.js';

const POLICY_ID = 'empty_loading_error_handled';

/**
 * Components that are "data-bound" in the sense that they collapse to nothing
 * when their data source is empty. A `Card` or `Button` with a data binding
 * does not have this problem (the prop fills in once the data resolves).
 */
const DATA_BOUND_COMPONENTS: ReadonlySet<string> = new Set([
  'List',
  'Table',
  'Grid',
  'KPIRow',
  'DetailView',
  'Chart',
  'Calendar',
  'Kanban',
  'Timeline',
  'Gallery',
  'Tree',
]);

/**
 * Roles whose registered custom bindings are subject to the same
 * empty/loading/error obligation. A custom `<IssueQueue compositionRole="list">`
 * collapses to nothing on an empty source the same way `<List>` does, so
 * the policy must apply.
 */
const DATA_BOUND_ROLES: ReadonlySet<string> = new Set(['list', 'table', 'grid']);

/** Components that, when present as a sibling, count as handling "empty". */
const EMPTY_HANDLER_COMPONENTS: ReadonlySet<string> = new Set(['EmptyState']);

/** Components that, as siblings, count as handling "loading". */
const LOADING_HANDLER_COMPONENTS: ReadonlySet<string> = new Set([
  'Spinner',
  'Skeleton',
  'Progress',
]);

/** Components that, as siblings, count as handling "error". */
const ERROR_HANDLER_COMPONENTS: ReadonlySet<string> = new Set(['Alert', 'ErrorState']);

/** State kinds the policy enforces. */
type StateKind = 'empty' | 'loading' | 'error';

interface StateSpec {
  /** Human-readable label used in violation messages. */
  label: string;
  /** Field name on `ComponentDataBinding` (slot 1). */
  bindingField: 'empty_state' | 'loading_state' | 'error_state';
  /** Conventional prop names (slot 2). Any defined value satisfies the rule. */
  propNames: readonly string[];
  /** Component names that, when sibling of the data-bound node, satisfy the rule. */
  siblingHandlers: ReadonlySet<string>;
}

const STATES: Readonly<Record<StateKind, StateSpec>> = {
  empty: {
    label: 'empty_state',
    bindingField: 'empty_state',
    propNames: ['emptyState', 'empty_state'],
    siblingHandlers: EMPTY_HANDLER_COMPONENTS,
  },
  loading: {
    label: 'loading_state',
    bindingField: 'loading_state',
    propNames: ['loadingState', 'loading_state'],
    siblingHandlers: LOADING_HANDLER_COMPONENTS,
  },
  error: {
    label: 'error_state',
    bindingField: 'error_state',
    propNames: ['errorState', 'error_state'],
    siblingHandlers: ERROR_HANDLER_COMPONENTS,
  },
};

/** Returns true iff `node.props[name]` is defined for any name in `propNames`. */
function nodeHasStateProp(node: LayoutNode, propNames: readonly string[]): boolean {
  if (!node.props) return false;
  for (const name of propNames) {
    const value = node.props[name];
    if (value !== undefined && value !== null) return true;
  }
  return false;
}

/**
 * Returns true iff some sibling of `node` (a child of `parent`, other than
 * `node` itself) has a component name in `siblingHandlers`.
 */
function siblingsHandle(
  node: LayoutNode,
  parent: LayoutNode | undefined,
  siblingHandlers: ReadonlySet<string>,
): boolean {
  if (!parent || !parent.children) return false;
  for (const sibling of parent.children) {
    if (sibling === node) continue;
    if (siblingHandlers.has(sibling.component)) return true;
  }
  return false;
}

/** True if `node` and its data binding handle `kind` via any of the three slots. */
function stateIsHandled(
  node: LayoutNode,
  parent: LayoutNode | undefined,
  kind: StateKind,
): boolean {
  const spec = STATES[kind];

  // Slot 1: declared on the data binding itself.
  if (node.data) {
    const slot = node.data[spec.bindingField];
    if (slot !== undefined) return true;
  }

  // Slot 2: a conventional prop name on the node.
  if (nodeHasStateProp(node, spec.propNames)) return true;

  // Slot 3: a sibling component handles it.
  if (siblingsHandle(node, parent, spec.siblingHandlers)) return true;

  return false;
}

export const emptyLoadingErrorHandled: NamedPolicy = {
  id: POLICY_ID,
  description:
    'Every data-bound component (List, Table, Grid, KPIRow, DetailView, Chart, Calendar, Kanban, Timeline, Gallery, Tree) declares empty, loading, and error states. The renderer supplies defaults; bindings that need custom slots opt in via requiresExplicitStateSlots.',
  applies_to: 'manifest',
  // The policy's own severity reports the strictest case it can emit. Most
  // violations are `info` (the renderer supplies a default); bindings that
  // opt into `requiresExplicitStateSlots` keep the original `error`.
  severity: 'error',
  evaluate(ctx): PolicyResult {
    const violations: PolicyViolation[] = [];

    const roles = ctx.composition_roles;
    const strictSet = ctx.requires_explicit_state_slots;

    walkManifest(ctx.manifest, (node, path, ancestors) => {
      // Baseline ids OR a host-registered binding whose role is data-bound.
      const role = roles?.[node.component];
      const isDataBound =
        DATA_BOUND_COMPONENTS.has(node.component) ||
        (role !== undefined && DATA_BOUND_ROLES.has(role));
      if (!isDataBound) return;
      if (!node.data) return; // No data binding — no obligation.

      const parent = ancestors.length > 0 ? ancestors[ancestors.length - 1] : undefined;
      const strict = strictSet?.has(node.component) === true;

      for (const kind of ['empty', 'loading', 'error'] as const) {
        if (stateIsHandled(node, parent, kind)) continue;
        const spec = STATES[kind];
        // Strict bindings keep the hard `error` (the renderer cannot supply a
        // default that fits this binding's visual identity). Otherwise the
        // resolver pipeline supplies a baseline default at runtime, so the
        // missing slot is only an `info` nudge for authors who want a custom
        // empty-zero / loading / error UI.
        const severity: 'error' | 'info' = strict ? 'error' : 'info';
        const message = strict
          ? `${node.component} at ${path} has data binding but no ${spec.label} (binding opts into strict empty/loading/error slots).`
          : `${node.component} at ${path} has data binding but no ${spec.label}; the resolver will supply a default. Provide a custom slot to override.`;
        violations.push({
          policy_id: POLICY_ID,
          severity,
          message,
          path,
          hint: `Add data.${spec.bindingField}, props.${spec.propNames[0] ?? spec.label}, or a sibling ${[...spec.siblingHandlers].join(' / ')} component.`,
        });
      }
    });

    // `ok` follows the global rule: only `error` violations block. `info`
    // ones are advisory and never gate compilation.
    const hasError = violations.some((v) => v.severity === 'error');
    return {
      ok: !hasError,
      violations,
    };
  },
};
