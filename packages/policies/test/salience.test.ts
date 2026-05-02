// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the Wave 7 / P-9 salience surface:
 *  - `matchCapabilityGlob` — the glob matcher.
 *  - `resolveSalience` — the precedence resolver.
 *  - `salienceResolved` — the advisory policy.
 */

import { describe, expect, it } from 'vitest';
import type { Capability, IntentProfile, LayoutNode, Manifest } from '@atelier/schemas';
import {
  DEFAULT_SALIENCE_LEVEL,
  matchCapabilityGlob,
  resolveSalience,
  salienceResolved,
  type SalienceLevel,
} from '../src/baseline/salience.js';
import type { PolicyContext } from '../src/result.js';

// -----------------------------------------------------------------------------
// matchCapabilityGlob
// -----------------------------------------------------------------------------

describe('matchCapabilityGlob', () => {
  it('treats a literal pattern as an exact match', () => {
    expect(matchCapabilityGlob('github.issue.close', 'github.issue.close')).toBe(true);
    expect(matchCapabilityGlob('github.issue.close', 'github.issue.archive')).toBe(false);
  });

  it('expands `*` to one id segment (no `.` allowed)', () => {
    expect(matchCapabilityGlob('github.issue.*', 'github.issue.list')).toBe(true);
    expect(matchCapabilityGlob('github.issue.*', 'github.issue.archive')).toBe(true);
    // `*` does not match across the dot separator
    expect(matchCapabilityGlob('github.issue.*', 'github.issue.list.foo')).toBe(false);
  });

  it('expands `**` to any character including `.`', () => {
    expect(matchCapabilityGlob('github.**', 'github.issue.list')).toBe(true);
    expect(matchCapabilityGlob('github.**', 'github.api.rate_limit')).toBe(true);
    expect(matchCapabilityGlob('github.**', 'gitlab.issue.list')).toBe(false);
  });

  it('supports `*` in the middle of a pattern', () => {
    expect(matchCapabilityGlob('*.create_from_*', 'task.create_from_email')).toBe(true);
    expect(matchCapabilityGlob('*.create_from_*', 'task.archive')).toBe(false);
  });

  it('anchors at both ends — partial matches are rejected', () => {
    expect(matchCapabilityGlob('issue', 'github.issue.close')).toBe(false);
  });

  it('a malformed pattern silently misses rather than throwing', () => {
    // Invalid hand-crafted pattern: an escaped backslash with nothing after.
    // The compile step should swallow and return false.
    expect(() => matchCapabilityGlob('foo[unclosed', 'foo')).not.toThrow();
  });
});

// -----------------------------------------------------------------------------
// resolveSalience
// -----------------------------------------------------------------------------

function cap(level?: SalienceLevel, id = 'thread.archive'): Capability {
  return {
    id,
    kind: 'action',
    version: '1.0.0',
    input: {},
    output: {},
    side_effects: ['archive'],
    permissions: ['thread:write'],
    confirmation: 'inline',
    reversible: true,
    rollback: 'thread.unarchive',
    ...(level !== undefined ? { salience_level: level } : {}),
  };
}

function intent(
  overrides?: NonNullable<IntentProfile['priority_overrides']>,
): Pick<IntentProfile, 'priority_overrides'> {
  return overrides !== undefined ? { priority_overrides: overrides } : {};
}

describe('resolveSalience', () => {
  it('falls back to the framework default when the capability has no level and intent has no overrides', () => {
    expect(resolveSalience(cap(), intent())).toBe(DEFAULT_SALIENCE_LEVEL);
    expect(resolveSalience(cap(), undefined)).toBe('normal');
  });

  it('honours the capability’s declared level when no intent override matches', () => {
    expect(resolveSalience(cap('high'), intent())).toBe('high');
    expect(resolveSalience(cap('low'), intent())).toBe('low');
  });

  it('lets a matching priority_override win over the capability’s level', () => {
    const c = cap('low', 'github.issue.archive');
    const i = intent([{ capability_pattern: 'github.issue.*', salience: 'high' }]);
    expect(resolveSalience(c, i)).toBe('high');
  });

  it('lets a priority_override raise a missing level to high', () => {
    const c = cap(undefined, 'github.issue.list');
    const i = intent([{ capability_pattern: 'github.**', salience: 'high' }]);
    expect(resolveSalience(c, i)).toBe('high');
  });

  it('returns the FIRST matching override when several apply', () => {
    const c = cap('normal', 'github.issue.close');
    const i = intent([
      { capability_pattern: 'github.issue.close', salience: 'high' },
      { capability_pattern: 'github.**', salience: 'low' },
    ]);
    expect(resolveSalience(c, i)).toBe('high');
  });

  it('skips non-matching overrides', () => {
    const c = cap('low', 'thread.archive');
    const i = intent([{ capability_pattern: 'github.**', salience: 'high' }]);
    expect(resolveSalience(c, i)).toBe('low');
  });
});

// -----------------------------------------------------------------------------
// salienceResolved policy
// -----------------------------------------------------------------------------

function policyCtx(opts: {
  layout: LayoutNode;
  capability: Capability;
  intent?: Pick<IntentProfile, 'priority_overrides'>;
  composition_roles?: PolicyContext['composition_roles'];
}): PolicyContext {
  const manifest: Manifest = {
    manifest_id: 'm_salience01',
    user_id: 'u',
    app_id: 'a',
    compiled_from: {
      capability_version: '1.0.0',
      skill_versions: {},
      component_catalog_version: '1.0.0',
      intent_profile_version: 1,
      compiler_model: 'test',
      compiled_at: '2026-05-02T12:00:00Z',
    },
    ttl: null,
    invalidates_on: [],
    routes: [{ path: '/today', title: 'Today', layout: opts.layout }],
    policies_satisfied: [],
  };
  const ctx: PolicyContext = {
    manifest,
    capabilities: { [opts.capability.id]: opts.capability },
    intent: {
      user_id: 'u',
      global_preferences: {},
      granted_fields: [],
      ...(opts.intent?.priority_overrides !== undefined
        ? { priority_overrides: opts.intent.priority_overrides }
        : {}),
    },
    rate_limited_capability_ids: new Set(),
    pii_fields: new Set(),
    ...(opts.composition_roles ? { composition_roles: opts.composition_roles } : {}),
  };
  return ctx;
}

describe('salience_resolved policy', () => {
  it('clears when high-salience capability is bound to a salience-aware Queue', () => {
    const layout: LayoutNode = {
      component: 'Queue',
      data: { source: 'github.issue.list' },
    };
    const result = salienceResolved.evaluate(
      policyCtx({ layout, capability: cap('high', 'github.issue.list') }),
    );
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('clears for List, Grid, and Table', () => {
    for (const component of ['List', 'Grid', 'Table'] as const) {
      const layout: LayoutNode = {
        component,
        data: { source: 'github.issue.list' },
      };
      const result = salienceResolved.evaluate(
        policyCtx({ layout, capability: cap('high', 'github.issue.list') }),
      );
      expect(result.ok).toBe(true);
    }
  });

  it('emits an info advisory when a high-salience binding lands on a non-salience-aware component', () => {
    const layout: LayoutNode = {
      component: 'DetailView',
      data: { source: 'github.issue.list' },
    };
    const result = salienceResolved.evaluate(
      policyCtx({ layout, capability: cap('high', 'github.issue.list') }),
    );
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.severity).toBe('info');
    expect(v.policy_id).toBe('salience_resolved');
    expect(v.message).toContain('DetailView');
    expect(v.message).toContain('github.issue.list');
    expect(v.hint).toBeDefined();
  });

  it('passes when capability salience is not high', () => {
    const layout: LayoutNode = {
      component: 'DetailView',
      data: { source: 'github.issue.list' },
    };
    const result = salienceResolved.evaluate(
      policyCtx({ layout, capability: cap('normal', 'github.issue.list') }),
    );
    expect(result.ok).toBe(true);
  });

  it('respects intent priority_overrides — bumps a capability to high and surfaces the obligation', () => {
    const layout: LayoutNode = {
      component: 'DetailView',
      data: { source: 'github.issue.list' },
    };
    const result = salienceResolved.evaluate(
      policyCtx({
        layout,
        capability: cap(undefined, 'github.issue.list'),
        intent: { priority_overrides: [{ capability_pattern: 'github.**', salience: 'high' }] },
      }),
    );
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.severity).toBe('info');
  });

  it('clears when a custom component is registered with a salience-aware composition role', () => {
    const layout: LayoutNode = {
      component: 'IssueQueue',
      data: { source: 'github.issue.list' },
    };
    const result = salienceResolved.evaluate(
      policyCtx({
        layout,
        capability: cap('high', 'github.issue.list'),
        composition_roles: { IssueQueue: 'list' },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('skips nodes without a data source', () => {
    const layout: LayoutNode = { component: 'Stack', children: [] };
    const result = salienceResolved.evaluate(
      policyCtx({ layout, capability: cap('high', 'github.issue.list') }),
    );
    expect(result.ok).toBe(true);
  });

  it('skips bindings whose capability the registry does not know', () => {
    const layout: LayoutNode = {
      component: 'DetailView',
      data: { source: 'unknown.cap' },
    };
    const result = salienceResolved.evaluate(
      policyCtx({ layout, capability: cap('high', 'other.cap') }),
    );
    expect(result.ok).toBe(true);
  });
});
