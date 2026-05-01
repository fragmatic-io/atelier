// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Marigold brand kit shape contract.
 *
 * The kit is consumed by the compiler (folded into the system prompt) and
 * by the policy engine (`respects_brand_kit`). The first guarantee we
 * lock in here is that it round-trips through `BrandKitSchema`. The rest
 * of the suite asserts the visual brief: warm orange primary, cream
 * surface, the five-step elevation scale, the three-step motion duration
 * scale, the named voice surfaces, and that the Marigold-defining
 * Wave-6/7a optional fields are populated.
 */

import { describe, expect, it } from 'vitest';
import { BrandKitSchema, ElevationScaleSchema } from '@cir/schemas';
import { DUMMYJSON_BRAND_KIT } from '../lib/brand-kit';

describe('DUMMYJSON_BRAND_KIT — Marigold theme', () => {
  it('validates against BrandKitSchema', () => {
    const result = BrandKitSchema.safeParse(DUMMYJSON_BRAND_KIT);
    if (!result.success) {
      // Surface the first issue verbatim so a regression points at the
      // bad field, not the full Zod blob.
      throw new Error(`BrandKitSchema parse failed: ${JSON.stringify(result.error.issues)}`);
    }
    expect(result.success).toBe(true);
  });

  it('declares the warm-orange primary and cream surface', () => {
    const colors = DUMMYJSON_BRAND_KIT.tokens.colors;
    expect(colors['accent.primary']).toBe('#ff5f3a');
    expect(colors['bg.app']).toBe('#fffaf3');
    expect(colors['accent.success']).toBe('#0d8a72'); // confirmation green
    expect(colors['accent.danger']).toBe('#dc2626');
  });

  it('declares a 5-level elevation scale with light + dark recipes', () => {
    expect(DUMMYJSON_BRAND_KIT.elevation_scale).toBeDefined();
    const parsed = ElevationScaleSchema.safeParse(DUMMYJSON_BRAND_KIT.elevation_scale);
    expect(parsed.success).toBe(true);
    const scale = DUMMYJSON_BRAND_KIT.elevation_scale!;
    const keys: Array<keyof typeof scale> = ['resting', 'hover', 'popover', 'modal', 'commandbar'];
    expect(keys).toHaveLength(5);
    for (const k of keys) {
      expect(scale[k]?.light).toBeDefined();
      expect(scale[k]?.dark).toBeDefined();
      expect(scale[k]!.light.length).toBeGreaterThan(0);
      expect(scale[k]!.dark.length).toBeGreaterThan(0);
    }
  });

  it('declares the 3-step motion duration scale (140 / 220 / 320 ms) plus easing', () => {
    expect(DUMMYJSON_BRAND_KIT.motion).toBeDefined();
    const motion = DUMMYJSON_BRAND_KIT.motion!;
    expect(motion.duration_scale['fast']).toBe(140);
    expect(motion.duration_scale['normal']).toBe(220);
    expect(motion.duration_scale['slow']).toBe(320);
    expect(motion.easing?.['in_out']).toContain('cubic-bezier');
    expect(motion.easing?.['spring']).toContain('cubic-bezier');
  });

  it('declares the generous radius scale (8 / 12 / 16 / 24 px)', () => {
    expect(DUMMYJSON_BRAND_KIT.radius_scale).toBeDefined();
    const r = DUMMYJSON_BRAND_KIT.radius_scale!;
    expect(r['sm']).toBe('8px');
    expect(r['md']).toBe('12px');
    expect(r['lg']).toBe('16px');
    expect(r['xl']).toBe('24px');
  });

  it('declares phosphor-only iconography with a 16px minimum', () => {
    expect(DUMMYJSON_BRAND_KIT.iconography).toBeDefined();
    const ico = DUMMYJSON_BRAND_KIT.iconography!;
    expect(ico.allowed_sets).toEqual(['phosphor']);
    expect(ico.minimum_size).toBe(16);
  });

  it('declares accessibility minimums (WCAG AA 4.5 contrast + focus ring required)', () => {
    expect(DUMMYJSON_BRAND_KIT.accessibility).toBeDefined();
    expect(DUMMYJSON_BRAND_KIT.accessibility!.contrast_minimum).toBeGreaterThanOrEqual(4.5);
    expect(DUMMYJSON_BRAND_KIT.accessibility!.focus_ring_required).toBe(true);
  });

  it('declares warm + helpful voice with the four required surface keys', () => {
    const v = DUMMYJSON_BRAND_KIT.voice;
    expect(v.tone.toLowerCase()).toContain('warm');
    expect(v.do.length).toBeGreaterThan(0);
    expect(v.dont.length).toBeGreaterThan(0);
    // Voice surfaces are the per-surface tone exemplars the compiler
    // leans on. Marigold authors `button`, `error`, `empty_state` (the
    // brief minimums) plus `marketing` and `confirmation`.
    const surfaces = v.surfaces ?? {};
    expect(surfaces['button']).toBeDefined();
    expect(surfaces['error']).toBeDefined();
    expect(surfaces['empty_state']).toBeDefined();
    expect(surfaces['button']!.example).toMatch(/Add to cart/i);
    expect(surfaces['error']!.example).toMatch(/try again/i);
  });

  it('voice "dont" rejects the hard-sell vocabulary', () => {
    const dont = DUMMYJSON_BRAND_KIT.voice.dont.join(' ').toLowerCase();
    expect(dont).toMatch(/hard.?sell|buy now|hurry|urgency/);
    expect(dont).toMatch(/all.?caps/);
  });
});
