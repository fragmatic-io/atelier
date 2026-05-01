// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `manifest_component_contract_satisfied` — the schema-validated
 * per-binding manifest contract policy. Phase 2 #1.
 *
 * Catches the band-aid drift cases the policy is meant to replace:
 *   - NavBar `links` / `title` (commit 9ae2122) — UNKNOWN_KEY + missing required `items`.
 *   - Button receiving extra unknown keys (commit 9ae2122) — UNKNOWN_KEY.
 *   - List receiving valid `data` slot — accepts (formal contract).
 *   - Bindings without a contract — silently skipped (additive policy).
 *   - Capability dispatch keys (`app.foo.bar`) — skipped, never enforced.
 */

import { describe, expect, it } from 'vitest';
import {
  manifestComponentContractSatisfied,
  type ManifestComponentContracts,
} from '../src/baseline/manifest_component_contract_satisfied.ts';
import type { Manifest } from '@cir/schemas';
import type { PolicyContext } from '../src/result.ts';

function ctxFor(layout: Manifest['routes'][number]['layout']): PolicyContext {
  return {
    manifest: {
      manifest_id: 'm_test0001',
      user_id: 'u',
      app_id: 'a',
      compiled_from: {
        capability_version: '1.0.0',
        skill_versions: {},
        component_catalog_version: '1.0.0',
        intent_profile_version: 1,
        compiler_model: 'test',
        compiled_at: '2026-05-01T00:00:00Z',
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

const CONTRACTS: ManifestComponentContracts = {
  NavBar: {
    allowed_props: { items: 'array', brand: 'react-node', className: 'string' },
    required_props: ['items'],
  },
  Button: {
    allowed_props: {
      label: 'string',
      variant: 'string',
      icon: 'object',
      disabled: 'boolean',
    },
  },
  List: {
    allowed_props: { items: 'array', data: 'unknown', density: 'string' },
  },
  // A binding that opts out of unknown-key enforcement.
  Lenient: {
    allowed_props: { x: 'string' },
    allow_unknown: true,
  },
};

describe('manifestComponentContractSatisfied', () => {
  it('passes when a node satisfies its contract', () => {
    const policy = manifestComponentContractSatisfied(CONTRACTS);
    const ctx = ctxFor({
      component: 'NavBar',
      props: { items: [{ label: 'Home', href: '/' }] },
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('flags the NavBar `links`/`title` band-aid drift', () => {
    const policy = manifestComponentContractSatisfied(CONTRACTS);
    const ctx = ctxFor({
      component: 'NavBar',
      props: { links: [], title: 'Octant' },
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(false);
    // Missing required `items`.
    expect(
      result.violations.find((v) => v.message.includes('missing required prop "items"')),
    ).toBeDefined();
    // Unknown `links` and `title`.
    expect(result.violations.find((v) => v.message.includes('unknown prop "links"'))).toBeDefined();
    expect(result.violations.find((v) => v.message.includes('unknown prop "title"'))).toBeDefined();
  });

  it('flags Button extra unknown keys', () => {
    const policy = manifestComponentContractSatisfied(CONTRACTS);
    const ctx = ctxFor({
      component: 'Button',
      props: { label: 'Save', mystery_key: 1 },
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.message).toContain('mystery_key');
  });

  it('flags wrong-type values', () => {
    const policy = manifestComponentContractSatisfied(CONTRACTS);
    const ctx = ctxFor({
      component: 'NavBar',
      props: { items: 'not-an-array' },
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(false);
    expect(
      result.violations.find((v) => v.message.includes('expects array, got string')),
    ).toBeDefined();
  });

  it('skips capability-dispatch keys (dotted)', () => {
    const policy = manifestComponentContractSatisfied(CONTRACTS);
    // Renderer wires `props['app.cart.add'] = fn`. The contract should NOT
    // flag those — they are render-time mechanics, not author-supplied.
    const ctx = ctxFor({
      component: 'Button',
      props: { label: 'Add', 'app.cart.add': () => undefined },
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('honours allow_unknown when set', () => {
    const policy = manifestComponentContractSatisfied(CONTRACTS);
    const ctx = ctxFor({
      component: 'Lenient',
      props: { x: 'ok', y: 'tolerated' },
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('skips bindings without a contract', () => {
    const policy = manifestComponentContractSatisfied(CONTRACTS);
    // No contract for Stack — node is left alone.
    const ctx = ctxFor({
      component: 'Stack',
      props: { whatever: 'goes' },
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('walks nested children', () => {
    const policy = manifestComponentContractSatisfied(CONTRACTS);
    const ctx = ctxFor({
      component: 'Stack',
      children: [
        { component: 'Button', props: { label: 'Ok', illegal: true } },
        { component: 'NavBar', props: { items: [] } },
      ],
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.path).toBe('/routes/0/layout/children/0/props/illegal');
  });

  it('accepts the List `data` resolver-supplied alias', () => {
    const policy = manifestComponentContractSatisfied(CONTRACTS);
    // The renderer threads resolved data into `props.data`; that path
    // must satisfy the contract because it IS the formal contract.
    const ctx = ctxFor({
      component: 'List',
      props: { data: [{ id: 1 }, { id: 2 }] },
    });
    const result = policy.evaluate(ctx);
    expect(result.ok).toBe(true);
  });
});
