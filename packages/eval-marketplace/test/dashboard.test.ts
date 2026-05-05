// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the S2.2 cost-dashboard aggregator. Uses three checked-in
 * sample reports under `fixtures/llm-reports/` so the assertions are
 * grounded in concrete numbers — when the aggregation logic shifts, the
 * tests fail with a clear "expected vs got" diff instead of a flaky
 * generated-data mismatch.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { summariseLastNRuns } from '../src/dashboard.js';
import type { EvalReport } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, 'fixtures', 'llm-reports');

function loadReport(name: string): EvalReport {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8')) as EvalReport;
}

const REPORTS = [
  loadReport('2026-04-27.json'),
  loadReport('2026-04-30.json'),
  loadReport('2026-05-03.json'),
];

// Pin the clock to the latest fixture's generated_at so the 7-day /
// 30-day rolling-window assertions are deterministic.
const FIXED_NOW = Date.parse('2026-05-03T05:00:00.000Z');
const fixedNow = (): number => FIXED_NOW;

describe('summariseLastNRuns', () => {
  it('returns an empty summary when no LLM-mode reports are present', () => {
    const summary = summariseLastNRuns([], 7, fixedNow);
    expect(summary.runs_seen).toBe(0);
    expect(summary.window_start).toBeNull();
    expect(summary.window_end).toBeNull();
    expect(summary.spend_last_7_days_usd).toBe(0);
    expect(summary.personas).toEqual([]);
    expect(summary.top_5_most_expensive).toEqual([]);
    expect(summary.latest_run).toBeNull();
  });

  it('skips deterministic-mode reports (no total_cost_usd) cleanly', () => {
    const detReport: EvalReport = {
      generated_at: '2026-05-03T04:00:00.000Z',
      reference_versions: {
        capabilities_hash: 'x',
        components_hash: 'y',
        compiler_version: 'eval-marketplace-fallback',
      },
      personas: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, duration_ms: 0 },
    };
    const summary = summariseLastNRuns([detReport, ...REPORTS], 7, fixedNow);
    // Det report contributed nothing — only the 3 LLM reports counted.
    expect(summary.runs_seen).toBe(3);
  });

  it('aggregates the three sample reports with stable window bounds', () => {
    const summary = summariseLastNRuns(REPORTS, 7, fixedNow);
    expect(summary.runs_seen).toBe(3);
    expect(summary.window_start).toBe('2026-04-27T04:30:00.000Z');
    expect(summary.window_end).toBe('2026-05-03T04:30:00.000Z');
    // Latest-run summary mirrors the most recent report.
    expect(summary.latest_run).not.toBeNull();
    expect(summary.latest_run?.total_cost_usd).toBeCloseTo(0.01581, 5);
    expect(summary.latest_run?.pricing_revision).toBe('2026-05-03');
    expect(summary.latest_run?.pass_rate).toBe(1);
  });

  it('totals 7-day and 30-day spend correctly relative to a pinned now()', () => {
    const summary = summariseLastNRuns(REPORTS, 7, fixedNow);
    // Reports on 04-27, 04-30, 05-03; "now" pinned to 05-03 05:00.
    // 7-day cutoff is 04-26 05:00 — all three reports are inside the
    // window. Sum = 0.0121 + 0.0139 + 0.01581 = 0.04181.
    expect(summary.spend_last_7_days_usd).toBeCloseTo(0.04181, 5);
    expect(summary.spend_last_30_days_usd).toBeCloseTo(0.04181, 5);
  });

  it('falls back to a smaller window when fewer reports are available than n', () => {
    const summary = summariseLastNRuns(REPORTS, 100, fixedNow);
    expect(summary.runs_seen).toBe(3);
  });

  it('groups per-persona spend across all runs in the window', () => {
    const summary = summariseLastNRuns(REPORTS, 7, fixedNow);
    expect(summary.personas).toHaveLength(2);
    const a = summary.personas.find((p) => p.address.includes('persona-a'));
    const b = summary.personas.find((p) => p.address.includes('persona-b'));
    expect(a?.appearances).toBe(3);
    expect(b?.appearances).toBe(3);
    expect(a?.avg_usd).toBeCloseTo((0.0042 + 0.0049 + 0.00451) / 3, 6);
    expect(b?.avg_usd).toBeCloseTo((0.0079 + 0.009 + 0.0113) / 3, 6);
  });

  it('marks an upward trend when later runs cost more than earlier runs', () => {
    const summary = summariseLastNRuns(REPORTS, 7, fixedNow);
    const b = summary.personas.find((p) => p.address.includes('persona-b'));
    // persona-b: 0.0079 → 0.009 → 0.0113 — clearly trending up.
    expect(b?.trend).toBe('up');
  });

  it('top-5 most expensive sorts by avg_usd descending', () => {
    const summary = summariseLastNRuns(REPORTS, 7, fixedNow);
    expect(summary.top_5_most_expensive[0]?.address).toContain('persona-b');
    expect(summary.top_5_most_expensive[1]?.address).toContain('persona-a');
  });

  it('records the latest_model on each persona row', () => {
    const summary = summariseLastNRuns(REPORTS, 7, fixedNow);
    for (const p of summary.personas) {
      expect(p.latest_model).toBe('gemini-2.5-flash');
    }
  });

  it('honours `n` to keep only the most recent N runs', () => {
    // `n: 1` keeps just the last report.
    const summary = summariseLastNRuns(REPORTS, 1, fixedNow);
    expect(summary.runs_seen).toBe(1);
    expect(summary.window_start).toBe('2026-05-03T04:30:00.000Z');
    expect(summary.window_end).toBe('2026-05-03T04:30:00.000Z');
  });
});
