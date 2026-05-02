// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the `actions_match_action_slots` baseline policy.
 *
 * The policy fires when a manifest node declares more capabilities in
 * `actions: [...]` than the binding declares in `actionSlots`. Bindings
 * without an `actionSlots` entry on `PolicyContext.action_slots` are
 * unconstrained — the renderer falls back to legacy capability-id-as-prop
 * dispatch and the policy is silent.
 *
 * Severity: `error`.
 */

import { describe, expect, it } from 'vitest';
import { actionsMatchActionSlots } from '../src/baseline/actions_match_action_slots.js';
import type { LayoutNode, Manifest } from '@atelier/schemas';
import type { PolicyContext } from '../src/result.js';

function ctxFor(
  layout: LayoutNode,
  actionSlots?: Readonly<Record<string, readonly string[]>>,
): PolicyContext {
  const manifest: Manifest = {
    manifest_id: 'm_actionslots1',
    user_id: 'u',
    app_id: 'a',
    compiled_from: {
      capability_version: '1.0.0',
      skill_versions: {},
      component_catalog_version: '1.0.0',
      intent_profile_version: 1,
      compiler_model: 'test',
      compiled_at: '2026-05-01T12:00:00Z',
    },
    ttl: null,
    invalidates_on: [],
    routes: [{ path: '/today', title: 'Today', layout }],
    policies_satisfied: [],
  };
  return {
    manifest,
    capabilities: {},
    intent: { user_id: 'u', global_preferences: {}, granted_fields: [] },
    rate_limited_capability_ids: new Set(),
    pii_fields: new Set(),
    action_slots: actionSlots,
  };
}

describe('actions_match_action_slots', () => {
  it("passes when actions count is within the binding's slot count", () => {
    const layout: LayoutNode = {
      component: 'Button',
      actions: ['cap.one'],
    };
    const result = actionsMatchActionSlots.evaluate(
      ctxFor(layout, { Button: ['onPrimaryAction'] }),
    );
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('passes at the exact slot capacity', () => {
    const layout: LayoutNode = {
      component: 'BulkActionBar',
      actions: ['cap.primary', 'cap.secondary'],
    };
    const result = actionsMatchActionSlots.evaluate(
      ctxFor(layout, { BulkActionBar: ['onPrimaryAction', 'onSecondaryAction'] }),
    );
    expect(result.ok).toBe(true);
  });

  it('emits an error when actions exceed the slot count', () => {
    const layout: LayoutNode = {
      component: 'Button',
      actions: ['cap.one', 'cap.two'],
    };
    const result = actionsMatchActionSlots.evaluate(
      ctxFor(layout, { Button: ['onPrimaryAction'] }),
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.policy_id).toBe('actions_match_action_slots');
    expect(v.severity).toBe('error');
    expect(v.message).toContain('Button');
    expect(v.message).toContain('2 action');
    expect(v.message).toContain('1 action');
    expect(v.message).toContain('cap.two');
    expect(v.hint).toContain('Reduce node.actions');
  });

  it('is silent when the binding has no entry on action_slots (legacy fallback)', () => {
    const layout: LayoutNode = {
      component: 'IssueQueue',
      actions: ['cap.one', 'cap.two', 'cap.three'],
    };
    // No entry for IssueQueue — unconstrained.
    const result = actionsMatchActionSlots.evaluate(
      ctxFor(layout, { Button: ['onPrimaryAction'] }),
    );
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('is silent when no action_slots map is supplied at all', () => {
    const layout: LayoutNode = {
      component: 'Button',
      actions: ['cap.one', 'cap.two'],
    };
    const result = actionsMatchActionSlots.evaluate(ctxFor(layout, undefined));
    expect(result.ok).toBe(true);
  });

  it('is silent when a node has no actions', () => {
    const layout: LayoutNode = {
      component: 'Button',
    };
    const result = actionsMatchActionSlots.evaluate(
      ctxFor(layout, { Button: ['onPrimaryAction'] }),
    );
    expect(result.ok).toBe(true);
  });

  it('walks nested layouts and reports each violation independently', () => {
    const layout: LayoutNode = {
      component: 'Stack',
      children: [
        { component: 'Button', actions: ['cap.a', 'cap.b'] },
        { component: 'Button', actions: ['cap.c', 'cap.d', 'cap.e'] },
      ],
    };
    const result = actionsMatchActionSlots.evaluate(
      ctxFor(layout, { Button: ['onPrimaryAction'] }),
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});
