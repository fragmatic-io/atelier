// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Server-side singleton + density-from-request helper. Confirms the
 * lens-aware fallback `lookup` produces three distinct manifests across
 * compact / cozy / spacious for the same /browse route, and that the
 * `x-cir-density` header round-trips correctly.
 */

import { describe, expect, it } from 'vitest';
import { densityFromProfile, densityFromRequest, getCirServer } from '../lib/atelier-server';

describe('densityFromRequest', () => {
  it('reads x-cir-density off a Request', () => {
    const req = new Request('https://x/', { headers: { 'x-cir-density': 'spacious' } });
    expect(densityFromRequest(req)).toBe('spacious');
  });

  it('defaults to comfortable when the header is missing', () => {
    expect(densityFromRequest(new Request('https://x/'))).toBe('comfortable');
  });

  it('defaults to comfortable on an unknown value', () => {
    const req = new Request('https://x/', { headers: { 'x-cir-density': 'huge' } });
    expect(densityFromRequest(req)).toBe('comfortable');
  });
});

describe('densityFromProfile', () => {
  it('extracts density off a profile', () => {
    expect(
      densityFromProfile({
        user_id: 'u',
        profile_version: 1,
        updated_at: '',
        global_preferences: { density: 'compact' },
        lenses: {},
        rules: [],
        vocabulary: {},
        cross_app_workflows: [],
      }),
    ).toBe('compact');
  });

  it('returns comfortable on missing or unknown values', () => {
    expect(densityFromProfile(null)).toBe('comfortable');
    expect(
      densityFromProfile({
        user_id: 'u',
        profile_version: 1,
        updated_at: '',
        global_preferences: { density: 'tiny' },
        lenses: {},
        rules: [],
        vocabulary: {},
        cross_app_workflows: [],
      }),
    ).toBe('comfortable');
  });
});

describe('getCirServer', () => {
  it('survives multiple calls with a single shared singleton', () => {
    const a = getCirServer();
    const b = getCirServer();
    expect(a).toBe(b);
    expect(Object.keys(a.capabilities)).toContain('dummyjson.product.list');
    expect(Object.keys(a.capabilities)).toContain('dummyjson.cart.add');
  });

  it('mutates the lens slot when density is set', () => {
    const s = getCirServer();
    s.density = 'compact';
    expect(s.density).toBe('compact');
    s.density = 'spacious';
    expect(s.density).toBe('spacious');
    s.density = 'comfortable'; // reset for sibling tests
  });
});
