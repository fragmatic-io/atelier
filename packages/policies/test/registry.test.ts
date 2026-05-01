// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import { PolicyRegistry } from '../src/registry.js';
import { BASELINE_POLICIES } from '../src/validate.js';
import type { NamedPolicy } from '../src/result.js';

const dummy = (id: string, message = 'x'): NamedPolicy => ({
  id,
  description: `fixture: ${id}`,
  applies_to: 'manifest',
  severity: 'warn',
  evaluate: () => ({
    ok: true,
    violations: [{ policy_id: id, severity: 'warn', message, path: '/' }],
  }),
});

describe('PolicyRegistry', () => {
  it('default registry contains all baseline policies', () => {
    const registry = new PolicyRegistry();
    const ids = registry.all().map((p) => p.id);
    expect(ids).toEqual(BASELINE_POLICIES.map((p) => p.id));
    expect(ids).toHaveLength(BASELINE_POLICIES.length);
    for (const id of ids) {
      expect(registry.has(id)).toBe(true);
      expect(registry.get(id)).toBeDefined();
    }
  });

  it('register() adds a custom policy and all() includes it', () => {
    const registry = new PolicyRegistry([]);
    expect(registry.all()).toEqual([]);
    const custom = dummy('respects_org_chart');
    registry.register(custom);
    expect(registry.has('respects_org_chart')).toBe(true);
    expect(registry.get('respects_org_chart')).toBe(custom);
    expect(registry.all()).toHaveLength(1);
    expect(registry.all()[0]).toBe(custom);
  });

  it('register() with same id REPLACES (last write wins)', () => {
    const registry = new PolicyRegistry([]);
    const first = dummy('shared_id', 'first');
    const second = dummy('shared_id', 'second');
    registry.register(first);
    registry.register(second);
    expect(registry.all()).toHaveLength(1);
    expect(registry.get('shared_id')).toBe(second);
    expect(registry.get('shared_id')).not.toBe(first);
  });

  it('unregister() returns true on delete, false on miss', () => {
    const registry = new PolicyRegistry();
    expect(registry.unregister('data_access_within_grant')).toBe(true);
    expect(registry.has('data_access_within_grant')).toBe(false);
    expect(registry.unregister('data_access_within_grant')).toBe(false);
    expect(registry.unregister('does_not_exist')).toBe(false);
  });
});
