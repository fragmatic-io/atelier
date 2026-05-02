// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the `composes_hierarchy_for_long_lists` baseline policy
 * (Wave 7b / track P-9).
 *
 * The policy fires when:
 *  - a `<List>` / `<Table>` / `<Grid>` carries a `data` binding,
 *  - the bound capability declares a `salience_default`,
 *  - and the binding's expected cardinality exceeds 7 (heuristic).
 *
 * The manifest then must declare ONE of:
 *  1. `props.density: 'compact'`
 *  2. `props.emphasizeTopN >= 1`
 *  3. A sibling `<KPIRow>` summary above the binding (under a `<Stack>` ancestor)
 *
 * Severity: `warn`.
 */

import { describe, expect, it } from 'vitest';
import { composesHierarchyForLongLists } from '../src/baseline/composes_hierarchy_for_long_lists.js';
import type { Capability, LayoutNode, Manifest } from '@atelier/schemas';
import type { PolicyContext } from '../src/result.js';

function capability(opts: { salience?: string | null } = {}): Capability {
  // Default salience expression; pass `{ salience: null }` to omit the field.
  const salience = opts.salience === undefined ? 'urgency * recency' : opts.salience;
  return {
    id: 'thread.list',
    kind: 'data',
    version: '1.0.0',
    input: {},
    output: {},
    side_effects: ['reads:thread_state'],
    permissions: ['thread:read'],
    confirmation: 'none',
    reversible: true,
    ...(salience !== null ? { salience_default: salience } : {}),
  };
}

function ctxFor(layout: LayoutNode, cap: Capability = capability()): PolicyContext {
  const manifest: Manifest = {
    manifest_id: 'm_hierarchy01',
    user_id: 'u',
    app_id: 'a',
    compiled_from: {
      capability_version: '1.0.0',
      skill_versions: {},
      component_catalog_version: '1.0.0',
      intent_profile_version: 1,
      compiler_model: 'test',
      compiled_at: '2026-04-29T12:00:00Z',
    },
    ttl: null,
    invalidates_on: [],
    routes: [{ path: '/today', title: 'Today', layout }],
    policies_satisfied: [],
  };
  return {
    manifest,
    capabilities: { [cap.id]: cap },
    intent: { user_id: 'u', global_preferences: {}, granted_fields: [] },
    rate_limited_capability_ids: new Set(),
    pii_fields: new Set(),
  };
}

describe('composes_hierarchy_for_long_lists', () => {
  it('warns on a long-cardinality List with salience_default but no hierarchy treatment', () => {
    const layout: LayoutNode = {
      component: 'List',
      data: { source: 'thread.list' },
    };
    const result = composesHierarchyForLongLists.evaluate(ctxFor(layout));
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.severity).toBe('warn');
    expect(v.policy_id).toBe('composes_hierarchy_for_long_lists');
    expect(v.message).toContain('thread.list');
    expect(v.message).toContain('lacks hierarchy treatment');
    expect(v.hint).toContain("density: 'compact'");
    expect(v.hint).toContain('emphasizeTopN');
    expect(v.hint).toContain('KPIRow');
  });

  it('passes when the List declares props.density = "compact"', () => {
    const layout: LayoutNode = {
      component: 'List',
      data: { source: 'thread.list' },
      props: { density: 'compact' },
    };
    const result = composesHierarchyForLongLists.evaluate(ctxFor(layout));
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes when the Table declares props.emphasizeTopN >= 1', () => {
    const layout: LayoutNode = {
      component: 'Table',
      data: { source: 'thread.list' },
      props: { emphasizeTopN: 3 },
    };
    const result = composesHierarchyForLongLists.evaluate(ctxFor(layout));
    expect(result.ok).toBe(true);
  });

  it('passes when the Grid is wrapped in a Stack with a KPIRow sibling above', () => {
    const layout: LayoutNode = {
      component: 'Stack',
      children: [{ component: 'KPIRow' }, { component: 'Grid', data: { source: 'thread.list' } }],
    };
    const result = composesHierarchyForLongLists.evaluate(ctxFor(layout));
    expect(result.ok).toBe(true);
  });

  it('passes when the bound capability declares no salience_default (no obligation)', () => {
    const layout: LayoutNode = {
      component: 'List',
      data: { source: 'thread.list' },
    };
    const result = composesHierarchyForLongLists.evaluate(
      ctxFor(layout, capability({ salience: null })),
    );
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes when an explicit cardinality hint is at or below the threshold (≤ 7)', () => {
    const layout: LayoutNode = {
      component: 'List',
      data: { source: 'thread.list', expected_count: 5 },
    };
    const result = composesHierarchyForLongLists.evaluate(ctxFor(layout));
    expect(result.ok).toBe(true);
  });

  it('exposes the expected metadata on the NamedPolicy', () => {
    expect(composesHierarchyForLongLists.id).toBe('composes_hierarchy_for_long_lists');
    expect(composesHierarchyForLongLists.applies_to).toBe('manifest');
    expect(composesHierarchyForLongLists.severity).toBe('warn');
    expect(composesHierarchyForLongLists.description).toContain('hierarchy');
  });

  it('applies to host-registered custom bindings whose composition role is list-ish', () => {
    // Custom `<IssueQueue>` with a long-list role and no hierarchy treatment
    // should warn — same as a bare `<List>` would.
    const layout: LayoutNode = {
      component: 'IssueQueue',
      data: { source: 'thread.list' },
    };
    const ctx = ctxFor(layout);
    const result = composesHierarchyForLongLists.evaluate({
      ...ctx,
      composition_roles: { IssueQueue: 'list' },
    });
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.message).toContain('IssueQueue');
  });

  it('passes when a role-tagged custom binding declares emphasizeTopN', () => {
    const layout: LayoutNode = {
      component: 'IssueQueue',
      data: { source: 'thread.list' },
      props: { emphasizeTopN: 3 },
    };
    const ctx = ctxFor(layout);
    const result = composesHierarchyForLongLists.evaluate({
      ...ctx,
      composition_roles: { IssueQueue: 'list' },
    });
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes when the binding declares a row_binding (rich rows substitute for hierarchy)', () => {
    // Phase 2 #3 — a baseline `<Grid row_binding="ProductCard">` is the
    // alternative to the `compositionRole` escape hatch. The row factory
    // carries the hierarchy treatment internally, so the long-list policy
    // is satisfied without `density:'compact'` / `emphasizeTopN` / KPIRow.
    const layout: LayoutNode = {
      component: 'Grid',
      data: { source: 'thread.list' },
      row_binding: 'ProductCard',
    };
    const result = composesHierarchyForLongLists.evaluate(ctxFor(layout));
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('does NOT apply to a custom binding without a registered composition role', () => {
    // Backwards compatibility: bindings without a role are unaffected.
    const layout: LayoutNode = {
      component: 'IssueQueue',
      data: { source: 'thread.list' },
    };
    const result = composesHierarchyForLongLists.evaluate(ctxFor(layout));
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
