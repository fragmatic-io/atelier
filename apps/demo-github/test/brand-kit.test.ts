// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Brand kit (Octant) sanity tests for `apps/demo-github`.
 *
 * The kit is the contract the compiler folds into its system prompt and
 * the `respects_brand_kit` policy enforces. These tests pin the shape:
 *
 *   1. The kit validates against `BrandKitSchema`.
 *   2. Per-surface voice guidance is present for the surfaces the brief
 *      enumerates (button, error, empty_state).
 *   3. The elevation scale carries 5 levels (resting / hover / popover /
 *      modal / commandbar), each with paired light + dark recipes.
 *   4. Motion durations sit at 80 / 120 / 200 ms.
 *   5. Iconography declares the `octicons` allow-list with a 14 px floor.
 *   6. The mono font stack starts with IBM Plex Mono.
 */

import { describe, expect, it } from 'vitest';
import { BrandKitSchema } from '@atelier/schemas';
import {
  DEMO_GITHUB_BRAND_KIT,
  FONT_STACK_MONO_OCTANT,
  FONT_STACK_SANS_OCTANT,
  brandKit,
} from '../lib/brand-kit';

describe('Octant brand kit', () => {
  it('validates against BrandKitSchema', () => {
    const result = BrandKitSchema.safeParse(DEMO_GITHUB_BRAND_KIT);
    if (!result.success) {
      // Surface the first parse error so failing tests are diagnosable.
      // eslint-disable-next-line no-console
      console.error(result.error.format());
    }
    expect(result.success).toBe(true);
  });

  it('exposes per-surface voice guidance for button / error / empty_state', () => {
    const surfaces = DEMO_GITHUB_BRAND_KIT.voice.surfaces;
    expect(surfaces).toBeDefined();
    expect(surfaces!['button']).toEqual({
      tone: 'imperative',
      example: 'Close issue',
    });
    expect(surfaces!['error']?.tone).toBe('precise');
    expect(surfaces!['error']?.example).toContain('rate limit exceeded');
    expect(surfaces!['empty_state']?.tone).toBe('factual');
    expect(surfaces!['empty_state']?.example).toBe('No open issues assigned to you.');
  });

  it('declares all five elevation levels with light + dark recipes', () => {
    const elevation = DEMO_GITHUB_BRAND_KIT.elevation_scale;
    expect(elevation).toBeDefined();
    const levels = ['resting', 'hover', 'popover', 'modal', 'commandbar'] as const;
    expect(Object.keys(elevation!).sort()).toEqual([...levels].sort());
    for (const key of levels) {
      const pair = elevation![key];
      expect(pair.light, `${key}.light`).toMatch(/.+/);
      expect(pair.dark, `${key}.dark`).toMatch(/.+/);
    }
  });

  it('uses GitHub-flavoured palette with 4.5 minimum contrast', () => {
    const { tokens, accessibility } = DEMO_GITHUB_BRAND_KIT;
    expect(tokens.colors['brand.primary']).toBe('#1f883d');
    expect(tokens.colors['brand.accent']).toBe('#0969da');
    expect(tokens.colors['state.danger']).toBe('#cf222e');
    expect(tokens.colors['state.warning']).toBe('#9a6700');
    expect(accessibility?.contrast_minimum).toBe(4.5);
    expect(accessibility?.focus_ring_required).toBe(true);
  });

  it('motion durations are 80 / 120 / 200 ms with cubic-bezier easing', () => {
    const motion = DEMO_GITHUB_BRAND_KIT.motion;
    expect(motion).toBeDefined();
    expect(motion!.duration_scale['fast']).toBe(80);
    expect(motion!.duration_scale['normal']).toBe(120);
    expect(motion!.duration_scale['slow']).toBe(200);
    expect(motion!.easing?.['in_out']).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
    expect(motion!.easing?.['linear']).toBe('linear');
  });

  it('declares octicons as the allowed icon set with a 14 px floor', () => {
    const icons = DEMO_GITHUB_BRAND_KIT.iconography;
    expect(icons?.allowed_sets).toEqual(['octicons']);
    expect(icons?.minimum_size).toBe(14);
  });

  it('mono font stack leads with IBM Plex Mono, sans leads with Inter', () => {
    expect(FONT_STACK_MONO_OCTANT.startsWith('"IBM Plex Mono"')).toBe(true);
    expect(FONT_STACK_SANS_OCTANT.startsWith('Inter')).toBe(true);
    // Sans stack inside the kit should match.
    expect(DEMO_GITHUB_BRAND_KIT.tokens.typography.font_stack).toBe(FONT_STACK_SANS_OCTANT);
  });

  it('radius scale is the tight 3 / 4 / 6 / 8 ladder', () => {
    const radius = DEMO_GITHUB_BRAND_KIT.radius_scale;
    expect(radius).toEqual({ xs: '3px', sm: '4px', md: '6px', lg: '8px' });
  });

  it('back-compat brandKit alias re-exports the same kit', () => {
    expect(brandKit).toBe(DEMO_GITHUB_BRAND_KIT);
    expect(brandKit.id).toBe('cir.demo-github.octant');
  });
});
