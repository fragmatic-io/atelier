// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for the `composes_according_to_rules` policy factory.
 *
 * The factory takes a `CompositionRules` map (typically the catalog's
 * exported rules) and returns a `NamedPolicy` that walks every layout node
 * and checks each component against its rule.
 */

import { describe, expect, it } from 'vitest';
import { composesAccordingTo, type CompositionRules } from '../src/baseline/composition_rules.ts';
import type { Manifest } from '@cir/schemas';
import type { PolicyContext } from '../src/result.ts';

function ctxFor(layout: Manifest['routes'][number]['layout']): PolicyContext {
  return {
    manifest: {
      manifest_id: 'm_t',
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
      routes: [{ path: '/x', title: 'x', layout }],
      policies_satisfied: [],
    },
    capabilities: {},
    intent: { user_id: 'u', global_preferences: {}, granted_fields: [] },
    rate_limited_capability_ids: new Set(),
    pii_fields: new Set(),
  };
}

const RULES: CompositionRules = {
  Stack: { can_contain: '*', min_children: 1, max_children: 3 },
  Card: { can_contain: ['Stack', 'Markdown'] as const },
  Markdown: { can_contain: 'leaf' },
  Wildcard: { can_contain: '*' },
};

describe('composesAccordingTo', () => {
  it('passes when a leaf has zero children', () => {
    const policy = composesAccordingTo(RULES);
    const ctx = ctxFor({ component: 'Markdown' });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('flags a leaf with children', () => {
    const policy = composesAccordingTo(RULES);
    const ctx = ctxFor({
      component: 'Markdown',
      children: [{ component: 'Markdown' }],
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(false);
    const v = result.violations.find((x) => x.message.includes('is a leaf'));
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
    expect(v?.path).toBe('/routes/0/layout/children');
  });

  it('passes when an explicit list contains the child', () => {
    const policy = composesAccordingTo(RULES);
    const ctx = ctxFor({
      component: 'Card',
      children: [{ component: 'Markdown' }],
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('flags a child not in the explicit allow list and reports the right path', () => {
    const policy = composesAccordingTo(RULES);
    const ctx = ctxFor({
      component: 'Card',
      children: [
        { component: 'Markdown' },
        { component: 'Wildcard' }, // not in [Stack, Markdown]
      ],
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(false);
    const v = result.violations.find((x) => x.message.includes('cannot contain "Wildcard"'));
    expect(v).toBeDefined();
    expect(v?.path).toBe('/routes/0/layout/children/1');
    expect(v?.message).toContain('Allowed: [Stack, Markdown]');
  });

  it('passes when "*" with anything', () => {
    const policy = composesAccordingTo(RULES);
    const ctx = ctxFor({
      component: 'Wildcard',
      children: [
        { component: 'Markdown' },
        { component: 'Stack', children: [{ component: 'Markdown' }] },
        { component: 'TotallyUnknown' },
      ],
    });
    const result = policy.evaluate(ctx);
    // The Wildcard itself permits anything; the Stack inside has 1 child
    // (within min/max=3); the unknown component is skipped.
    expect(result.ok).toBe(true);
  });

  it('flags min_children violation', () => {
    const policy = composesAccordingTo(RULES);
    const ctx = ctxFor({ component: 'Stack', children: [] });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(false);
    const v = result.violations.find((x) => x.message.includes('at least 1 children'));
    expect(v).toBeDefined();
    expect(v?.path).toBe('/routes/0/layout/children');
  });

  it('flags max_children violation', () => {
    const policy = composesAccordingTo(RULES);
    const ctx = ctxFor({
      component: 'Stack',
      children: [
        { component: 'Markdown' },
        { component: 'Markdown' },
        { component: 'Markdown' },
        { component: 'Markdown' },
      ],
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(false);
    const v = result.violations.find((x) => x.message.includes('at most 3 children'));
    expect(v).toBeDefined();
    expect(v?.path).toBe('/routes/0/layout/children');
  });

  it('skips components with no rule (unknown — runtime renders fallback)', () => {
    const policy = composesAccordingTo(RULES);
    const ctx = ctxFor({
      component: 'TotallyUnknown',
      children: [
        { component: 'AnotherUnknown' },
        { component: 'Markdown' }, // leaf — fine on its own
      ],
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('exposes the expected metadata on the returned NamedPolicy', () => {
    const policy = composesAccordingTo(RULES);
    expect(policy.id).toBe('composes_according_to_rules');
    expect(policy.applies_to).toBe('manifest');
    expect(policy.severity).toBe('error');
  });

  it('inherits the baseline rule when a custom binding declares compositionRole', () => {
    // The host registered `ProductGrid` with `compositionRole: 'grid'`. The
    // RULES map does not list ProductGrid directly. With `composition_roles`
    // threaded onto the context, `ProductGrid`'s children are validated
    // against the rule for `Grid` (or the closest baseline `'*'` carrier
    // in this test, which we set up explicitly).
    const rulesWithGrid: CompositionRules = {
      ...RULES,
      Grid: { can_contain: ['Markdown', 'Stack'] as const },
    };
    const policy = composesAccordingTo(rulesWithGrid);
    const ctx: PolicyContext = {
      ...ctxFor({
        component: 'ProductGrid',
        children: [{ component: 'Wildcard' }],
      }),
      composition_roles: { ProductGrid: 'grid' },
    };
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(false);
    const v = result.violations.find((x) => x.message.includes('"ProductGrid"'));
    expect(v).toBeDefined();
    expect(v?.message).toContain('Allowed: [Markdown, Stack]');
  });
});
