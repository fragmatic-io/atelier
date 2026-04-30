// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for the `respects_brand_kit` policy.
 *
 * The baseline checks (variants + raw colour/px detection) are exercised
 * implicitly via the existing manifest fixtures. These tests focus on the
 * Wave 6 (P-6) extensions: radius / shadow / motion scales and the inline
 * contrast warning.
 */

import { describe, expect, it } from 'vitest';
import type { BrandKit, Manifest } from '@cir/schemas';
import { respectsBrandKit, hexContrastRatio } from '../src/baseline/respects_brand_kit.ts';
import type { PolicyContext } from '../src/result.ts';
import { baselineContext } from './fixtures/manifest.ts';

function kitWith(extras: Partial<BrandKit>): BrandKit {
  return {
    id: 'cir.test',
    version: '0.1.0',
    tokens: {
      colors: { 'fg.primary': '#111827', 'bg.app': '#ffffff' },
      spacing: { md: '16px' },
      typography: { font_stack: 'system-ui', scale: { base: '14px' } },
    },
    variants: { Card: ['default'] },
    voice: { tone: 'Direct.', do: [], dont: [] },
    ...extras,
  };
}

/** Build a minimal manifest with one route + one node carrying inline props. */
function manifestWithProps(component: string, props: Record<string, unknown>): Manifest {
  return {
    manifest_id: 'm_brand_test',
    user_id: 'u',
    app_id: 'a',
    compiled_from: {
      capability_version: '1.0.0',
      skill_versions: {},
      component_catalog_version: '1.0.0',
      intent_profile_version: 1,
      compiler_model: 'test',
      compiled_at: '2026-04-30T00:00:00Z',
    },
    ttl: null,
    invalidates_on: [],
    routes: [
      {
        path: '/',
        title: 'Test',
        layout: { component, props, children: [] },
      },
    ],
    policies_satisfied: [],
  };
}

function ctxWith(kit: BrandKit, manifest: Manifest): PolicyContext {
  const base = baselineContext();
  return {
    ...base,
    manifest,
    brand_kit: kit,
  };
}

// ----------------------------------------------------------------------------
// No-kit no-op + baseline pass-through.
// ----------------------------------------------------------------------------

describe('respects_brand_kit — passes when kit absent', () => {
  it('returns ok when ctx.brand_kit is undefined', () => {
    const ctx = baselineContext();
    const res = respectsBrandKit.evaluate(ctx);
    expect(res.ok).toBe(true);
    expect(res.violations).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// Radius scale.
// ----------------------------------------------------------------------------

describe('respects_brand_kit — radius_scale', () => {
  const kit = kitWith({ radius_scale: { sm: '4px', md: '8px', lg: '12px' } });

  it('passes when border-radius matches the scale', () => {
    const m = manifestWithProps('Card', { 'border-radius': '8px' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    // raw 8px would normally trip the px detector — but the radius branch
    // still flags it. Either way, the message we want is the radius_scale one.
    const radius = res.violations.find((v) => v.message.includes('radius_scale'));
    expect(radius).toBeUndefined();
  });

  it('flags an off-scale border-radius value', () => {
    const m = manifestWithProps('Card', { borderRadius: '7px' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    const v = res.violations.find((x) => x.message.includes('radius_scale'));
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  it('skips the check when the kit declares no radius_scale', () => {
    const noKit = kitWith({});
    const m = manifestWithProps('Card', { borderRadius: '7px' });
    const res = respectsBrandKit.evaluate(ctxWith(noKit, m));
    const v = res.violations.find((x) => x.message.includes('radius_scale'));
    expect(v).toBeUndefined();
  });

  it('accepts token references without inspecting the scale', () => {
    const m = manifestWithProps('Card', { borderRadius: 'token:radius.md' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    const v = res.violations.find((x) => x.message.includes('radius_scale'));
    expect(v).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
// Shadow scale.
// ----------------------------------------------------------------------------

describe('respects_brand_kit — shadow_scale', () => {
  const kit = kitWith({
    shadow_scale: {
      sm: '0 1px 2px rgba(0,0,0,0.06)',
      md: '0 4px 6px rgba(0,0,0,0.1)',
    },
  });

  it('passes when box-shadow matches the scale', () => {
    const m = manifestWithProps('Card', { 'box-shadow': '0 1px 2px rgba(0,0,0,0.06)' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    const v = res.violations.find((x) => x.message.includes('shadow_scale'));
    expect(v).toBeUndefined();
  });

  it('flags an off-scale shadow', () => {
    const m = manifestWithProps('Card', { boxShadow: '0 99px 99px red' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    const v = res.violations.find((x) => x.message.includes('shadow_scale'));
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });
});

// ----------------------------------------------------------------------------
// Motion duration scale.
// ----------------------------------------------------------------------------

describe('respects_brand_kit — motion.duration_scale', () => {
  const kit = kitWith({
    motion: { duration_scale: { fast: 120, normal: 200, slow: 320 } },
  });

  it('passes when transition-duration matches the scale (ms)', () => {
    const m = manifestWithProps('Card', { 'transition-duration': '200ms' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    const v = res.violations.find((x) => x.message.includes('duration_scale'));
    expect(v).toBeUndefined();
  });

  it('passes when the value is a seconds string mapping to a known ms', () => {
    const m = manifestWithProps('Card', { animationDuration: '0.32s' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    const v = res.violations.find((x) => x.message.includes('duration_scale'));
    expect(v).toBeUndefined();
  });

  it('flags an off-scale duration', () => {
    const m = manifestWithProps('Card', { duration: '500ms' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    const v = res.violations.find((x) => x.message.includes('duration_scale'));
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  it('flags an unparseable duration as off-scale', () => {
    const m = manifestWithProps('Card', { duration: 'eventually' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    const v = res.violations.find((x) => x.message.includes('duration_scale'));
    expect(v).toBeDefined();
  });
});

// ----------------------------------------------------------------------------
// Inline contrast heuristic.
// ----------------------------------------------------------------------------

describe('respects_brand_kit — accessibility contrast', () => {
  it('hexContrastRatio computes 21 for black-on-white', () => {
    const r = hexContrastRatio('#000000', '#ffffff');
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(21, 0);
  });

  it('warns when an inline fg/bg pair falls below contrast_minimum', () => {
    const kit = kitWith({ accessibility: { contrast_minimum: 4.5, focus_ring_required: true } });
    // light gray text on white — ratio ~1.6
    const m = manifestWithProps('Card', { color: '#cccccc', background: '#ffffff' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    const v = res.violations.find((x) => x.message.includes('contrast'));
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warn');
    // contrast warning shouldn't block — ok stays true if no errors fired.
    expect(res.ok).toBe(false); // raw hex still trips the looksRaw error.
  });

  it('does not warn when the pair meets the minimum', () => {
    const kit = kitWith({ accessibility: { contrast_minimum: 4.5, focus_ring_required: true } });
    const m = manifestWithProps('Card', { color: '#000000', background: '#ffffff' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    const v = res.violations.find((x) => x.message.includes('contrast'));
    expect(v).toBeUndefined();
  });

  it('skips the check when only one side of the pair is present', () => {
    const kit = kitWith({ accessibility: { contrast_minimum: 4.5, focus_ring_required: true } });
    const m = manifestWithProps('Card', { color: '#cccccc' });
    const res = respectsBrandKit.evaluate(ctxWith(kit, m));
    const v = res.violations.find((x) => x.message.includes('contrast'));
    expect(v).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
// Backwards compatibility — baseline manifests still pass.
// ----------------------------------------------------------------------------

describe('respects_brand_kit — backwards compat', () => {
  it('the existing baseline manifest passes against a Wave-6 kit', () => {
    const kit = kitWith({
      radius_scale: { sm: '4px' },
      shadow_scale: { sm: '0 1px 2px rgba(0,0,0,0.06)' },
      motion: { duration_scale: { fast: 120 } },
      accessibility: { contrast_minimum: 4.5, focus_ring_required: true },
    });
    const ctx = baselineContext();
    ctx.brand_kit = kit;
    const res = respectsBrandKit.evaluate(ctx);
    expect(res.ok).toBe(true);
    expect(res.violations).toEqual([]);
  });
});
