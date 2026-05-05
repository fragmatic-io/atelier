// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Unit tests for the Gemini pricing tables. Verifies the cost arithmetic
 * matches the published per-1M-token rates and that unknown models fall
 * back to `gemini-2.5-flash` without throwing.
 *
 * The constants in `pricing.ts` are the source of truth. When Google
 * rotates pricing, bump those numbers + `PRICING_REVISION` together;
 * these tests anchor on a few representative samples so a stale-table
 * mismatch surfaces in CI.
 */

import { describe, expect, it } from 'vitest';

import { GEMINI_PRICING, PRICING_REVISION, costUsdFor, pricingFor } from '../src/pricing.js';

describe('GEMINI_PRICING table', () => {
  it('declares an up-to-date pricing revision string', () => {
    expect(PRICING_REVISION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('carries pricing rows for the marketplace gate models', () => {
    expect(GEMINI_PRICING['gemini-2.5-flash']).toBeDefined();
    expect(GEMINI_PRICING['gemini-2.5-pro']).toBeDefined();
  });

  it('records output tokens as more expensive than input on every priced model', () => {
    for (const [, row] of Object.entries(GEMINI_PRICING)) {
      expect(row.output_per_1m).toBeGreaterThanOrEqual(row.input_per_1m);
    }
  });
});

describe('costUsdFor', () => {
  it('multiplies tokens by the per-1M-token rate for the named model', () => {
    // 1M input + 1M output of gemini-2.5-flash ≈ 0.30 + 2.50 = 2.80 USD.
    const cost = costUsdFor('gemini-2.5-flash', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(2.8, 4);
  });

  it('handles fractional token counts cleanly', () => {
    // 5k input + 1k output of flash ≈ (5e3 * 0.30 / 1e6) + (1e3 * 2.5 / 1e6)
    // = 0.0015 + 0.0025 = 0.004 USD.
    const cost = costUsdFor('gemini-2.5-flash', 5_000, 1_000);
    expect(cost).toBeCloseTo(0.004, 6);
  });

  it('returns 0 for zero tokens regardless of model', () => {
    expect(costUsdFor('gemini-2.5-flash', 0, 0)).toBe(0);
    expect(costUsdFor('gemini-2.5-pro', 0, 0)).toBe(0);
  });

  it('falls back to flash pricing when the model is unrecognised', () => {
    const fallback = costUsdFor('gemini-99-omega', 1_000_000, 1_000_000);
    const flash = costUsdFor('gemini-2.5-flash', 1_000_000, 1_000_000);
    expect(fallback).toBeCloseTo(flash, 6);
  });

  it('input + output components scale linearly', () => {
    // Doubling inputs doubles cost.
    const a = costUsdFor('gemini-2.5-pro', 1_000, 0);
    const b = costUsdFor('gemini-2.5-pro', 2_000, 0);
    expect(b).toBeCloseTo(a * 2, 6);
  });
});

describe('pricingFor', () => {
  it('returns undefined for unknown models (does not silently fall back)', () => {
    expect(pricingFor('made-up-model')).toBeUndefined();
  });

  it('returns the matching pricing row for known models', () => {
    const row = pricingFor('gemini-2.5-flash');
    expect(row).toBeDefined();
    expect(row?.input_per_1m).toBeGreaterThan(0);
    expect(row?.output_per_1m).toBeGreaterThan(0);
  });
});
