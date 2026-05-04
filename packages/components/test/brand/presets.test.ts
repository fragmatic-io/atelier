// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import { BrandKitSchema } from '@atelier/schemas';

import {
  atelierBrandKits,
  brandKitToCssVars,
  defaultBrandKitId,
  resolveAtelierBrandKit,
  toCssTokenName,
} from '../../src/index.js';

describe('Atelier brand kit presets', () => {
  it('ship valid BrandKit contracts', () => {
    for (const brandKit of Object.values(atelierBrandKits)) {
      expect(() => BrandKitSchema.parse(brandKit)).not.toThrow();
    }
  });

  it('falls back to the default preset for unknown ids', () => {
    expect(resolveAtelierBrandKit(undefined).id).toBe(atelierBrandKits[defaultBrandKitId].id);
    expect(resolveAtelierBrandKit('missing').id).toBe(atelierBrandKits[defaultBrandKitId].id);
  });

  it('projects semantic and raw token CSS variables', () => {
    const vars = brandKitToCssVars(atelierBrandKits.commerce);

    expect(vars['--atelier-bg-app']).toBe('#fffaf3');
    expect(vars['--atelier-accent-primary']).toBe('#ff5f3a');
    expect(vars['--atelier-color-accent-primary']).toBe('#ff5f3a');
    expect(vars['--atelier-font-sans']).toContain('Inter');
    expect(vars['--atelier-radius-md']).toBe('12px');
    expect(vars['--atelier-duration-normal']).toBe('220ms');
    expect(vars['--atelier-motion-duration-normal']).toBe('220ms');
  });

  it('normalizes token names for CSS variable suffixes', () => {
    expect(toCssTokenName('dark.bg.surface')).toBe('dark-bg-surface');
    expect(toCssTokenName('  accent.primary_hover  ')).toBe('accent-primary-hover');
  });
});
