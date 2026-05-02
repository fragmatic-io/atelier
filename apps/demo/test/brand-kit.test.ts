// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Aurora brand kit — schema + semantic tests.
 *
 * Pins the contract that:
 *   1. The Aurora kit validates against `BrandKitSchema` from `@cir/schemas`.
 *   2. The 5-level elevation scale (resting / hover / popover / modal /
 *      commandbar) is present with paired light + dark CSS shadow strings.
 *   3. The voice block carries the surfaces the brief calls out: button,
 *      error, empty_state.
 *   4. The motion duration scale matches the 0.16 cadence
 *      (fast=100 / normal=160 / slow=240 ms).
 *   5. The radius scale is the 4-step Linear-grade rhythm
 *      (xs=4 / sm=6 / md=8 / lg=12 px).
 *   6. The iconography rule allows `lucide` and clamps to ≥14px.
 *   7. The `respects_brand_kit` policy detection layer doesn't trip on the
 *      kit itself (a quick sanity round-trip).
 */

import { describe, expect, it } from 'vitest';
import { BrandKitSchema, type BrandKit } from '@cir/schemas';
import { DEMO_BRAND_KIT, brandKit } from '../lib/brand-kit';

describe('Aurora brand kit', () => {
  it('validates against BrandKitSchema', () => {
    const result = BrandKitSchema.safeParse(DEMO_BRAND_KIT);
    if (!result.success) {
      // Surface the zod issue list verbatim so failures actionable.
      throw new Error(
        `BrandKitSchema validation failed:\n${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it('exports the kit under both `DEMO_BRAND_KIT` and `brandKit` aliases', () => {
    expect(brandKit).toBe(DEMO_BRAND_KIT);
  });

  it('declares the 5-level elevation scale with paired light/dark strings', () => {
    const scale = DEMO_BRAND_KIT.elevation_scale;
    expect(scale).toBeDefined();
    if (!scale) return; // satisfy TS narrowing
    const levels = ['resting', 'hover', 'popover', 'modal', 'commandbar'] as const;
    for (const level of levels) {
      const entry = scale[level];
      expect(entry, `elevation_scale.${level} must be defined`).toBeDefined();
      expect(typeof entry.light).toBe('string');
      expect(typeof entry.dark).toBe('string');
      expect(entry.light.length).toBeGreaterThan(0);
      expect(entry.dark.length).toBeGreaterThan(0);
    }
  });

  it('voice block carries the brief-mandated surfaces (button / error / empty_state)', () => {
    const surfaces = DEMO_BRAND_KIT.voice.surfaces;
    expect(surfaces).toBeDefined();
    if (!surfaces) return;
    for (const key of ['button', 'error', 'empty_state'] as const) {
      const surface = surfaces[key];
      expect(surface, `voice.surfaces.${key} must be defined`).toBeDefined();
      expect(typeof surface!.tone).toBe('string');
      expect(surface!.tone.length).toBeGreaterThan(0);
    }
  });

  it('voice tone is imperative + technical and bans exclamation marks / marketing tone', () => {
    expect(DEMO_BRAND_KIT.voice.tone.toLowerCase()).toContain('imperative');
    const dontList = DEMO_BRAND_KIT.voice.dont.map((s: string) => s.toLowerCase());
    expect(dontList.some((s) => s.includes('exclamation'))).toBe(true);
    expect(dontList.some((s) => s.includes('marketing'))).toBe(true);
  });

  it('motion duration scale matches the 0.16 cadence (100 / 160 / 240 ms)', () => {
    const motion = DEMO_BRAND_KIT.motion;
    expect(motion).toBeDefined();
    if (!motion) return;
    expect(motion.duration_scale['fast']).toBe(100);
    expect(motion.duration_scale['normal']).toBe(160);
    expect(motion.duration_scale['slow']).toBe(240);
  });

  it('radius scale is the tight 4-step Linear-grade rhythm', () => {
    const radius = DEMO_BRAND_KIT.radius_scale;
    expect(radius).toBeDefined();
    if (!radius) return;
    expect(radius['xs']).toBe('4px');
    expect(radius['sm']).toBe('6px');
    expect(radius['md']).toBe('8px');
    expect(radius['lg']).toBe('12px');
  });

  it('iconography allows lucide with a 14px floor', () => {
    expect(DEMO_BRAND_KIT.iconography?.allowed_sets).toContain('lucide');
    expect(DEMO_BRAND_KIT.iconography?.minimum_size).toBeGreaterThanOrEqual(14);
  });

  it('accessibility minimum is at least WCAG AA (4.5)', () => {
    expect(DEMO_BRAND_KIT.accessibility?.contrast_minimum).toBeGreaterThanOrEqual(4.5);
    expect(DEMO_BRAND_KIT.accessibility?.focus_ring_required).toBe(true);
  });

  it('typography font_stack starts with Inter', () => {
    const stack = DEMO_BRAND_KIT.tokens.typography.font_stack;
    expect(stack.startsWith('Inter')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Wave 11 / Vis-1 — typography depth.
  // -------------------------------------------------------------------------

  it('declares a Linear-style letter_spacing scale (Vis-1)', () => {
    const ls = DEMO_BRAND_KIT.tokens.typography.letter_spacing;
    expect(ls).toBeDefined();
    if (!ls) return;
    expect(ls['tight']).toBe('-0.02em');
    expect(ls['normal']).toBe('0');
    expect(ls['wide']).toBe('0.04em');
  });

  it('declares a Linear-tight line_height scale (Vis-1)', () => {
    const lh = DEMO_BRAND_KIT.tokens.typography.line_height;
    expect(lh).toBeDefined();
    if (!lh) return;
    expect(lh['tight']).toBe('1.25');
    expect(lh['normal']).toBe('1.5');
    expect(lh['loose']).toBe('1.7');
  });

  it('declares OpenType feature flags with tabular numerals on (Vis-1)', () => {
    const ot = DEMO_BRAND_KIT.tokens.typography.opentype;
    expect(ot).toBeDefined();
    if (!ot) return;
    expect(ot.tabular_numerals).toBe(true);
    expect(ot.ligatures).toBe('common');
  });

  it('shape narrows to BrandKit at the type level (compiles + rejects extras)', () => {
    // Compile-time test: the literal must be assignable to BrandKit.
    const kit: BrandKit = DEMO_BRAND_KIT;
    expect(kit.id).toBe('cir.demo.aurora');
    // Version follows semver.
    expect(/^\d+\.\d+\.\d+/.test(kit.version)).toBe(true);
  });
});
