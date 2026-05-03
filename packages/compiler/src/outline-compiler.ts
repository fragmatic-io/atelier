// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `OutlineCompiler` — the once-per-app pre-pass that produces an
 * `AppOutline` (chrome `LayoutNode`, nav list, common policies, skill
 * stack, brand kit id). Wave C / Phase C-4.
 *
 * The motivation: per-route compiles today re-derive the chrome
 * (`Stack(Logo, NavBar, StatusBar)`) every call, which (a) wastes tokens
 * and (b) lets the chrome drift across routes — different routes pick
 * different `<Logo>` sizes, different `<NavBar>` orderings, etc. C-4
 * lifts the chrome into an outline pass that runs once per app; per-
 * route compiles inherit it (rendering only the route's content area)
 * via `MultiRouteCompiler`.
 *
 * This module ships:
 *  - The `OutlineCompiler` interface — the host-replaceable seam.
 *  - `DeterministicOutlineCompiler` — the framework's deterministic
 *    baseline. Picks a fixed `Stack(Logo, NavBar, StatusBar)` chrome,
 *    builds the nav from the routes (sorted by `order`, ties broken by
 *    `routeId`), intersects per-route policy lists, unions per-route
 *    skill references (deduped + sorted). No LLM call; no network.
 *
 * The LLM-driven outline-compiler-agent (the design's stretch goal) is
 * intentionally NOT shipped here. The deliverable's value is the
 * contract + deterministic baseline + fan-out plumbing
 * (`MultiRouteCompiler`); the agent variant is a follow-up that can
 * land as a drop-in implementation of the same interface.
 *
 * ## Per-route input shape
 *
 * The spec lists the input as `{ id; intent: IntentProfile }`. In
 * practice `IntentProfile` does NOT carry policy ids or skill ids
 * (those live alongside the route, not inside the user's intent
 * profile). The interface here therefore extends the entry shape to
 * include explicit `policyIds` and `skillIds` fields — pragmatic
 * widening so the deterministic intersection / union semantics have
 * concrete data to operate on. `intent` is still threaded for any
 * implementation that wants to read user-level signals (e.g. a
 * smarter outline compiler picking nav order based on a `priority_*`
 * rule).
 */

import type {
  AppOutline,
  ComponentRegistry,
  IntentProfile,
  LayoutNode,
  NavEntry,
  Policy,
  Skill,
} from '@atelier/schemas';

/**
 * One route the outline pass is given. The deterministic baseline reads
 * `id` for nav entries, `policyIds` for the intersection step, and
 * `skillIds` for the union step. `label`, `icon`, and `order` feed the
 * nav entry directly; defaults apply if absent (`label = id`, `order =
 * insertion index`). `intent` is forwarded but unused by the
 * deterministic compiler — present so an LLM-driven sibling can read
 * it without a breaking interface change.
 */
export interface OutlineRouteInput {
  /** Stable route identifier — matches `NavEntry.routeId`. */
  id: string;
  /** Display label. Defaults to a humanized form of `id` when omitted. */
  label?: string;
  /** Optional icon id surfaced on the nav entry. */
  icon?: string;
  /** Sort order in the nav. Defaults to the route's index in the input array. */
  order?: number;
  /**
   * Policy ids the route declares as required. The deterministic
   * compiler intersects across all routes to derive
   * `outline.commonPolicies`.
   */
  policyIds?: readonly string[];
  /**
   * Skill ids the route references. The deterministic compiler unions
   * + dedupes + sorts to derive `outline.skillStack`.
   */
  skillIds?: readonly string[];
  /** Optional per-route intent slice. Forwarded to the implementation. */
  intent?: IntentProfile;
}

/**
 * Input bag for `OutlineCompiler.compileOutline`. The component / skill
 * / policy fields are present for parity with `CompileInput` so the
 * LLM-driven sibling has the same surface to lean on; the deterministic
 * baseline only needs `routes` + `brandKitId`.
 */
export interface CompileOutlineInput {
  routes: readonly OutlineRouteInput[];
  brandKitId: string;
  /** Component registry. Optional for the deterministic baseline. */
  components?: ComponentRegistry;
  /** Skill catalog — optional; deterministic baseline uses route-declared ids. */
  skills?: readonly Skill[];
  /** Policy catalog — optional; deterministic baseline uses route-declared ids. */
  policies?: readonly Policy[];
}

/**
 * The replaceable seam. Hosts can swap the deterministic baseline out
 * for an LLM-driven implementation without touching `MultiRouteCompiler`.
 */
export interface OutlineCompiler {
  /** Stable identifier for this compiler — recorded in audit events. */
  readonly id: string;
  compileOutline(input: CompileOutlineInput): Promise<AppOutline>;
}

const DETERMINISTIC_OUTLINE_COMPILER_ID = 'outline-deterministic';

/**
 * Deterministic baseline. Pure data transform — no LLM, no network.
 *
 * Chrome shape: `Stack(direction='vertical')` containing `<Logo>`,
 * `<NavBar items={nav}>`, and `<StatusBar>` pinned bottom (last child
 * of the stack). Per-route compiles render their own content area; the
 * runtime / host shell wraps the route layout INSIDE the chrome at
 * render time (chrome.children is appended to with the route's own
 * layout — but that wiring is the renderer's concern, not this
 * compiler's).
 *
 * Policy intersection: a policy is in `commonPolicies` iff every route
 * declares it. A route with no `policyIds` field is treated as having
 * declared an empty list — which causes the intersection to be empty
 * for any app where one route omits the field. This is the deliberate
 * "if you want a common policy, declare it on every route" semantics;
 * the sibling LLM compiler may infer differently.
 *
 * Skill union: every route's `skillIds` flatten into one set; the
 * result is sorted lexicographically for stability.
 */
export class DeterministicOutlineCompiler implements OutlineCompiler {
  readonly id = DETERMINISTIC_OUTLINE_COMPILER_ID;

  // eslint-disable-next-line @typescript-eslint/require-await
  async compileOutline(input: CompileOutlineInput): Promise<AppOutline> {
    const nav = buildNavEntries(input.routes);
    const chrome = buildChrome(nav);
    const commonPolicies = intersectPolicyIds(input.routes);
    const skillStack = unionSkillIds(input.routes);

    return {
      chrome,
      nav,
      commonPolicies,
      skillStack,
      brandKitId: input.brandKitId,
    };
  }
}

/**
 * Build nav entries from the route inputs. Sort by `(order, routeId)` so
 * the result is stable across runs even when two routes share an order.
 * Entries default `label = humanize(id)` and `order = index in input`.
 */
function buildNavEntries(routes: readonly OutlineRouteInput[]): NavEntry[] {
  const decorated = routes.map((r, idx) => {
    const entry: NavEntry = {
      routeId: r.id,
      label: r.label ?? humanize(r.id),
      order: r.order ?? idx,
    };
    if (r.icon !== undefined) entry.icon = r.icon;
    return entry;
  });
  decorated.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0;
  });
  return decorated;
}

/**
 * `Stack(Logo, NavBar, StatusBar)` — the canonical brand-chrome shape.
 * StatusBar is the LAST child by construction so the renderer can pin
 * it bottom (`align: 'end'` semantics on the host shell). Logo +
 * NavBar are first / second so a top-bar layout reads naturally.
 *
 * The `<NavBar>` carries the nav entries inline as a prop so any
 * runtime walker (or the host shell) can read them without reaching
 * back into the outline. Duplicating onto both `outline.nav` AND
 * `chrome.NavBar.props.items` is intentional — the outline is the
 * single source of truth for cross-route work, the prop is the
 * convenience for direct render.
 */
function buildChrome(nav: readonly NavEntry[]): LayoutNode {
  return {
    component: 'Stack',
    props: { direction: 'vertical', gap: 'md' },
    children: [
      { component: 'Logo', children: [] },
      {
        component: 'NavBar',
        props: { items: nav.map((n) => ({ ...n })) },
        children: [],
      },
      { component: 'StatusBar', children: [] },
    ],
  };
}

/**
 * Intersect per-route policy declarations. A policy is "common" iff it
 * appears in every route's `policyIds`. Empty input -> empty output.
 * Result sorted lexicographically for stability.
 */
function intersectPolicyIds(routes: readonly OutlineRouteInput[]): string[] {
  if (routes.length === 0) return [];
  const first = routes[0];
  if (!first || !first.policyIds || first.policyIds.length === 0) return [];

  let acc = new Set<string>(first.policyIds);
  for (let i = 1; i < routes.length; i++) {
    const next = new Set<string>(routes[i]?.policyIds ?? []);
    acc = new Set([...acc].filter((p) => next.has(p)));
    if (acc.size === 0) break;
  }
  return [...acc].sort();
}

/**
 * Union per-route skill references. Deduped + sorted lexicographically.
 */
function unionSkillIds(routes: readonly OutlineRouteInput[]): string[] {
  const out = new Set<string>();
  for (const r of routes) {
    for (const s of r.skillIds ?? []) out.add(s);
  }
  return [...out].sort();
}

/**
 * Convert a route id to a human-readable label. `inbox` -> `Inbox`,
 * `today-priorities` -> `Today priorities`. Used as the default when
 * `OutlineRouteInput.label` is omitted.
 */
function humanize(id: string): string {
  if (id.length === 0) return id;
  const spaced = id.replace(/[-_]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
