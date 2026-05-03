// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `AppOutlineSchema` — Wave C / Phase C-4.
 *
 * Roundtrip parse a full outline, then exercise the most load-bearing
 * rejection paths so a malformed outline can't slip past `parse()` and
 * cascade through the multi-route fan-out.
 */

import { describe, expect, it } from 'vitest';
import { AppOutlineSchema, NavEntrySchema, type AppOutline } from '../src/app-outline.js';

describe('AppOutlineSchema', () => {
  const VALID: AppOutline = {
    chrome: {
      component: 'Stack',
      props: { direction: 'vertical', gap: 'md' },
      children: [
        { component: 'Logo', children: [] },
        { component: 'NavBar', children: [] },
        { component: 'StatusBar', children: [] },
      ],
    },
    nav: [
      { routeId: 'today', label: 'Today', order: 0 },
      { routeId: 'inbox', label: 'Inbox', icon: 'inbox', order: 1 },
    ],
    commonPolicies: ['data_access_within_grant', 'respects_brand_kit'],
    skillStack: ['email-triage', 'inbox-zero'],
    brandKitId: 'demo-brand',
  };

  it('roundtrips a valid outline', () => {
    const parsed = AppOutlineSchema.parse(VALID);
    expect(parsed).toEqual(VALID);
  });

  it('rejects an outline whose chrome is missing the component field', () => {
    const bad = { ...VALID, chrome: { children: [] } as unknown };
    expect(AppOutlineSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects nav entries with empty routeId', () => {
    const bad = {
      ...VALID,
      nav: [{ routeId: '', label: 'Today', order: 0 }],
    };
    expect(AppOutlineSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects nav entries with negative order', () => {
    const bad = {
      ...VALID,
      nav: [{ routeId: 'today', label: 'Today', order: -1 }],
    };
    expect(AppOutlineSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects nav entries with non-integer order', () => {
    const bad = {
      ...VALID,
      nav: [{ routeId: 'today', label: 'Today', order: 1.5 }],
    };
    expect(AppOutlineSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty brandKitId', () => {
    const bad = { ...VALID, brandKitId: '' };
    expect(AppOutlineSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-string entries in commonPolicies / skillStack', () => {
    expect(
      AppOutlineSchema.safeParse({
        ...VALID,
        commonPolicies: ['ok', 42 as unknown as string],
      }).success,
    ).toBe(false);
    expect(
      AppOutlineSchema.safeParse({
        ...VALID,
        skillStack: [{} as unknown as string],
      }).success,
    ).toBe(false);
  });

  it('accepts an outline with no nav entries (single-route apps)', () => {
    const minimal: AppOutline = { ...VALID, nav: [] };
    expect(() => AppOutlineSchema.parse(minimal)).not.toThrow();
  });

  describe('NavEntrySchema', () => {
    it('accepts an entry without an icon', () => {
      expect(() =>
        NavEntrySchema.parse({ routeId: 'today', label: 'Today', order: 0 }),
      ).not.toThrow();
    });

    it('accepts an entry with an icon', () => {
      expect(() =>
        NavEntrySchema.parse({ routeId: 'inbox', label: 'Inbox', icon: 'inbox', order: 1 }),
      ).not.toThrow();
    });
  });
});
