// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Sanity checks on the capability registry the demo binds against.
 * Mirrors the JSON capability files that ship under
 * `capabilities/dummyjson/` — `cir-schemas validate-data` exercises
 * those at the root level; this test lives at the app level to lock the
 * runtime registry against the same shape.
 */

import { describe, expect, it } from 'vitest';
import { CapabilitySchema } from '@cir/schemas';
import { CAPABILITIES } from '../lib/capabilities';

describe('CAPABILITIES', () => {
  it('every capability validates against CapabilitySchema', () => {
    for (const id of Object.keys(CAPABILITIES)) {
      const cap = CAPABILITIES[id]!;
      const result = CapabilitySchema.safeParse(cap);
      if (!result.success) {
        // Surface the failing capability + issue for triage.
        // eslint-disable-next-line no-console
        console.error(`capability ${id} failed validation`, result.error.issues);
      }
      expect(result.success).toBe(true);
    }
  });

  it('cart.add is reversible+low_stakes — the optimistic-UI autodetect requires this', () => {
    const cap = CAPABILITIES['dummyjson.cart.add']!;
    expect(cap.reversible).toBe(true);
    expect(cap.low_stakes).toBe(true);
    expect(cap.rollback).toBe('dummyjson.cart.remove');
  });

  it('cart.remove is reversible+low_stakes — undo of cart.add', () => {
    const cap = CAPABILITIES['dummyjson.cart.remove']!;
    expect(cap.reversible).toBe(true);
    expect(cap.low_stakes).toBe(true);
    expect(cap.rollback).toBe('dummyjson.cart.add');
  });

  it('product.list and product.search are read-only data capabilities', () => {
    expect(CAPABILITIES['dummyjson.product.list']!.kind).toBe('data');
    expect(CAPABILITIES['dummyjson.product.search']!.kind).toBe('data');
    expect(CAPABILITIES['dummyjson.product.list']!.permissions).toContain('catalog:read');
  });
});
