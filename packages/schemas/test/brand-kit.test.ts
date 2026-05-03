// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `BrandKitSchema`.
 *
 * Covers the Wave 6 (P-6) extensions: radius_scale, shadow_scale, motion,
 * iconography, voice surfaces, accessibility — accept happy paths, reject
 * malformed inputs, and confirm baseline (extension-free) kits still
 * validate.
 */

import { describe, expect, it } from 'vitest';
import { BrandKitSchema, type BrandKit } from '../src/brand-kit.js';

function baseKit(): BrandKit {
  return {
    id: 'cir.test',
    version: '0.1.0',
    tokens: {
      colors: { 'fg.primary': '#111827', 'bg.app': '#ffffff' },
      spacing: { sm: '8px', md: '16px' },
      typography: {
        font_stack: 'system-ui, sans-serif',
        scale: { base: '14px', lg: '16px' },
      },
    },
    variants: {
      Button: ['primary', 'secondary'],
    },
    voice: {
      tone: 'Direct.',
      do: ['Use sentence case.'],
      dont: ["Don't shout."],
    },
  };
}

describe('BrandKitSchema (baseline)', () => {
  it('accepts a kit with no Wave 6 extensions', () => {
    const result = BrandKitSchema.safeParse(baseKit());
    expect(result.success).toBe(true);
  });
});

describe('BrandKitSchema — radius_scale', () => {
  it('accepts a typical radius scale', () => {
    const kit = baseKit();
    kit.radius_scale = { xs: '2px', sm: '4px', md: '8px', lg: '12px', xl: '16px' };
    expect(BrandKitSchema.safeParse(kit).success).toBe(true);
  });

  it('rejects a non-string value', () => {
    const kit = baseKit() as unknown as Record<string, unknown>;
    kit['radius_scale'] = { sm: 4 };
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
  });
});

describe('BrandKitSchema — shadow_scale', () => {
  it('accepts a typical shadow scale', () => {
    const kit = baseKit();
    kit.shadow_scale = {
      sm: '0 1px 2px rgba(0,0,0,0.06)',
      md: '0 4px 6px rgba(0,0,0,0.1)',
    };
    expect(BrandKitSchema.safeParse(kit).success).toBe(true);
  });
});

describe('BrandKitSchema — motion', () => {
  it('accepts duration_scale + easing', () => {
    const kit = baseKit();
    kit.motion = {
      duration_scale: { fast: 120, normal: 200, slow: 320 },
      easing: { in: 'cubic-bezier(.4,0,1,1)', out: 'cubic-bezier(0,0,.2,1)' },
    };
    expect(BrandKitSchema.safeParse(kit).success).toBe(true);
  });

  it('rejects non-integer durations', () => {
    const kit = baseKit() as unknown as { motion?: unknown };
    kit.motion = { duration_scale: { fast: 120.5 } };
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
  });

  it('rejects negative durations', () => {
    const kit = baseKit() as unknown as { motion?: unknown };
    kit.motion = { duration_scale: { fast: -10 } };
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
  });
});

describe('BrandKitSchema — iconography', () => {
  it('accepts allowed_sets + minimum_size', () => {
    const kit = baseKit();
    kit.iconography = { allowed_sets: ['lucide', 'phosphor'], minimum_size: 16 };
    expect(BrandKitSchema.safeParse(kit).success).toBe(true);
  });

  it('rejects an empty allowed_sets array', () => {
    const kit = baseKit() as unknown as { iconography?: unknown };
    kit.iconography = { allowed_sets: [], minimum_size: 16 };
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
  });

  it('rejects a zero or negative minimum_size', () => {
    const kit = baseKit() as unknown as { iconography?: unknown };
    kit.iconography = { allowed_sets: ['lucide'], minimum_size: 0 };
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
  });
});

describe('BrandKitSchema — voice surfaces', () => {
  it('accepts per-surface voice', () => {
    const kit = baseKit();
    kit.voice.surfaces = {
      button: { tone: 'imperative', example: 'Archive thread' },
      error: { tone: 'plain' },
    };
    expect(BrandKitSchema.safeParse(kit).success).toBe(true);
  });

  it('rejects a surface with empty tone', () => {
    const kit = baseKit() as unknown as { voice: { surfaces?: unknown } };
    kit.voice.surfaces = { button: { tone: '' } };
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
  });
});

describe('BrandKitSchema — accessibility', () => {
  it('accepts contrast_minimum + focus_ring_required', () => {
    const kit = baseKit();
    kit.accessibility = { contrast_minimum: 4.5, focus_ring_required: true };
    expect(BrandKitSchema.safeParse(kit).success).toBe(true);
  });

  it('rejects a non-positive contrast_minimum', () => {
    const kit = baseKit() as unknown as { accessibility?: unknown };
    kit.accessibility = { contrast_minimum: 0, focus_ring_required: true };
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
  });

  it('rejects a missing focus_ring_required flag', () => {
    const kit = baseKit() as unknown as { accessibility?: unknown };
    kit.accessibility = { contrast_minimum: 4.5 };
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
  });
});

describe('BrandKitSchema — round-trip', () => {
  it('survives a full Wave-6 kit', () => {
    const kit: BrandKit = {
      ...baseKit(),
      radius_scale: { xs: '2px', sm: '4px', md: '8px' },
      shadow_scale: { sm: '0 1px 2px rgba(0,0,0,0.06)' },
      motion: {
        duration_scale: { fast: 120, normal: 200 },
        easing: { in_out: 'cubic-bezier(.4,0,.2,1)' },
      },
      iconography: { allowed_sets: ['lucide'], minimum_size: 16 },
      accessibility: { contrast_minimum: 4.5, focus_ring_required: true },
    };
    kit.voice.surfaces = { button: { tone: 'imperative' } };
    const parsed = BrandKitSchema.parse(kit);
    expect(parsed.radius_scale?.['md']).toBe('8px');
    expect(parsed.motion?.duration_scale['fast']).toBe(120);
    expect(parsed.voice.surfaces?.['button']?.tone).toBe('imperative');
  });
});

// -----------------------------------------------------------------------------
// Wave 11 / Vis-10 — notification token group
// -----------------------------------------------------------------------------

describe('BrandKitSchema — tokens.notification (Vis-10)', () => {
  it('baseline kit (no notification group) still validates', () => {
    expect(BrandKitSchema.safeParse(baseKit()).success).toBe(true);
  });

  it('accepts a kit with the full notification token group', () => {
    const kit = baseKit();
    kit.tokens.notification = {
      counter_bg: '#374151',
      counter_fg: '#f3f4f6',
      mention_bg: '#ef4444',
      mention_fg: '#ffffff',
      pulse_ms: 1200,
    };
    const parsed = BrandKitSchema.safeParse(kit);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.tokens.notification?.counter_bg).toBe('#374151');
      expect(parsed.data.tokens.notification?.pulse_ms).toBe(1200);
    }
  });

  it('accepts a partial notification token group', () => {
    const kit = baseKit();
    kit.tokens.notification = { counter_bg: '#374151' };
    expect(BrandKitSchema.safeParse(kit).success).toBe(true);
  });

  it('rejects a non-integer pulse_ms', () => {
    const kit = baseKit();
    kit.tokens.notification = { pulse_ms: 1.5 };
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
  });

  it('rejects a negative pulse_ms', () => {
    const kit = baseKit();
    kit.tokens.notification = { pulse_ms: -10 };
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
  });

  it('accepts pulse_ms=0 (disabled)', () => {
    const kit = baseKit();
    kit.tokens.notification = { pulse_ms: 0 };
    expect(BrandKitSchema.safeParse(kit).success).toBe(true);
  });
});
