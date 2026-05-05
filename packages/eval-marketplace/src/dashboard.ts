// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * S2.2 — cost dashboard aggregator. Pure functions over a series of
 * `EvalReport`s the workflow has accumulated under `eval-reports/`.
 *
 * This module is intentionally side-effect-free: the I/O (reading the
 * reports directory, writing the JSON + MDX outputs) lives in
 * `scripts/marketplace-cost-dashboard.ts`. Keeping the aggregation pure
 * makes it trivially unit-testable (see `test/dashboard.test.ts`) and
 * means the same function can power both the CLI and a future
 * web-rendered dashboard without forking.
 */

import type { EvalReport, LlmEvalCompileResult } from './types.js';

/**
 * Direction of movement between the two halves of the input window.
 * `stable` means the relative change is below the band threshold (default
 * ±10%). The thresholds are the workflow's WoW gate — keep them in lock-
 * step with `.github/workflows/marketplace-eval-llm.yml` if you change.
 */
export type CostTrend = 'up' | 'down' | 'stable';

/** Per-persona aggregate row in the dashboard. */
export interface CostSummaryPersona {
  address: string;
  /** Mean cost across every appearance of this persona in the window. */
  avg_usd: number;
  /** 95th-percentile cost across appearances; falls back to max when N≤2. */
  p95_usd: number;
  /**
   * Trend across the window: split the runs in half, compare the avg cost
   * of the older half against the avg cost of the newer half. ±10% band
   * counts as `stable`.
   */
  trend: CostTrend;
  /** Number of runs this persona appeared in. */
  appearances: number;
  /** Latest model id observed (most recent run wins on tie). */
  latest_model: string;
}

/**
 * Aggregate dashboard shape — what the JSON + MDX outputs render against.
 * Stable across runs so the docs page can `import.meta.glob` it later if
 * we want a live-rendered surface; today it's regenerated MDX.
 */
export interface CostSummary {
  /** ISO-8601 UTC timestamp the aggregator ran. */
  generated_at: string;
  /** Number of source reports the aggregator consumed. */
  runs_seen: number;
  /** ISO-8601 UTC timestamp of the oldest report consumed. */
  window_start: string | null;
  /** ISO-8601 UTC timestamp of the newest report consumed. */
  window_end: string | null;
  /** Total spend across reports inside a 7-day rolling window. */
  spend_last_7_days_usd: number;
  /** Total spend across reports inside a 30-day rolling window. */
  spend_last_30_days_usd: number;
  /** Per-persona aggregates, sorted alphabetically by address. */
  personas: CostSummaryPersona[];
  /** Top-5 most-expensive personas by mean cost. */
  top_5_most_expensive: CostSummaryPersona[];
  /**
   * Latest-run summary fields lifted as-is for the dashboard's "today"
   * row. `null` when no runs were seen.
   */
  latest_run: {
    generated_at: string;
    total_cost_usd: number;
    cost_per_persona_avg_usd: number;
    cost_per_persona_p95_usd: number;
    pass_rate: number;
    pricing_revision: string;
  } | null;
}

interface PersonaSeenSample {
  cost_usd: number;
  generated_at: string;
  model: string;
}

/**
 * Aggregate the last `n` reports into a dashboard summary.
 *
 * The reports are NOT assumed to be sorted; we sort by `generated_at`
 * ascending internally, then take the trailing `n`. Reports without a
 * `summary.total_cost_usd` (deterministic-mode runs) contribute nothing
 * — they're filtered out at the edge.
 *
 * @param reports — every available `EvalReport`. The aggregator filters
 *                  to LLM-mode runs internally.
 * @param n       — keep at most this many runs for the headline window.
 *                  Pass a large number (e.g. 1000) for "all runs".
 * @param now     — clock injection for tests; defaults to `Date.now`.
 */
export function summariseLastNRuns(
  reports: readonly EvalReport[],
  n: number,
  now: () => number = Date.now,
): CostSummary {
  // Filter to LLM-mode reports (those with at least one priced row).
  const llmReports = reports.filter((r) => r.summary.total_cost_usd !== undefined);
  // Sort ascending by generated_at, then keep the last n.
  const sorted = [...llmReports].sort((a, b) => a.generated_at.localeCompare(b.generated_at));
  const window = sorted.slice(-n);

  const generated_at = new Date(now()).toISOString();

  if (window.length === 0) {
    return {
      generated_at,
      runs_seen: 0,
      window_start: null,
      window_end: null,
      spend_last_7_days_usd: 0,
      spend_last_30_days_usd: 0,
      personas: [],
      top_5_most_expensive: [],
      latest_run: null,
    };
  }

  // Rolling-window spend totals — cheap O(reports) scan.
  const cutoff7 = now() - 7 * 24 * 60 * 60 * 1000;
  const cutoff30 = now() - 30 * 24 * 60 * 60 * 1000;
  let spend7 = 0;
  let spend30 = 0;
  for (const r of window) {
    const t = Date.parse(r.generated_at);
    if (Number.isNaN(t)) continue;
    if (t >= cutoff7) spend7 += r.summary.total_cost_usd ?? 0;
    if (t >= cutoff30) spend30 += r.summary.total_cost_usd ?? 0;
  }

  // Per-persona accumulator. We capture every appearance + its run
  // timestamp + cost so the trend split is straightforward later.
  const byPersona = new Map<string, PersonaSeenSample[]>();
  for (const r of window) {
    for (const p of r.personas) {
      const llm = p.llm;
      if (llm === undefined) continue;
      const existing = byPersona.get(p.address) ?? [];
      existing.push({
        cost_usd: llm.cost_usd,
        generated_at: r.generated_at,
        model: llm.model,
      });
      byPersona.set(p.address, existing);
    }
  }

  const personas: CostSummaryPersona[] = [];
  for (const [address, samples] of byPersona) {
    // Sort each persona's samples by run time ascending so the trend
    // split is deterministic.
    samples.sort((a, b) => a.generated_at.localeCompare(b.generated_at));
    const costs = samples.map((s) => s.cost_usd);
    const avg = costs.reduce((acc, c) => acc + c, 0) / costs.length;
    const p95 = percentile(costs, 0.95);
    const trend = computeTrend(samples);
    const latest_model = samples[samples.length - 1]?.model ?? 'unknown';
    personas.push({
      address,
      avg_usd: avg,
      p95_usd: p95,
      trend,
      appearances: samples.length,
      latest_model,
    });
  }
  personas.sort((a, b) => a.address.localeCompare(b.address));

  const top_5_most_expensive = [...personas].sort((a, b) => b.avg_usd - a.avg_usd).slice(0, 5);

  const latest = window[window.length - 1];
  let latest_run: CostSummary['latest_run'] = null;
  if (latest !== undefined) {
    const total = latest.summary.total ?? 0;
    const passed = latest.summary.passed ?? 0;
    latest_run = {
      generated_at: latest.generated_at,
      total_cost_usd: latest.summary.total_cost_usd ?? 0,
      cost_per_persona_avg_usd: latest.summary.cost_per_persona_avg_usd ?? 0,
      cost_per_persona_p95_usd: latest.summary.cost_per_persona_p95_usd ?? 0,
      pass_rate: total === 0 ? 0 : passed / total,
      pricing_revision: latest.summary.pricing_revision ?? 'unknown',
    };
  }

  return {
    generated_at,
    runs_seen: window.length,
    window_start: window[0]?.generated_at ?? null,
    window_end: window[window.length - 1]?.generated_at ?? null,
    spend_last_7_days_usd: spend7,
    spend_last_30_days_usd: spend30,
    personas,
    top_5_most_expensive,
    latest_run,
  };
}

/**
 * Trend split: take the older half + newer half of a sample series and
 * compare averages with a ±10% band. With <2 samples we can't split, so
 * the trend is `stable` by definition.
 */
function computeTrend(samples: readonly PersonaSeenSample[]): CostTrend {
  if (samples.length < 2) return 'stable';
  const mid = Math.floor(samples.length / 2);
  const older = samples.slice(0, mid);
  const newer = samples.slice(mid);
  if (older.length === 0 || newer.length === 0) return 'stable';
  const olderAvg = older.reduce((acc, s) => acc + s.cost_usd, 0) / older.length;
  const newerAvg = newer.reduce((acc, s) => acc + s.cost_usd, 0) / newer.length;
  if (olderAvg === 0) {
    if (newerAvg === 0) return 'stable';
    return 'up';
  }
  const ratio = newerAvg / olderAvg;
  if (ratio > 1.1) return 'up';
  if (ratio < 0.9) return 'down';
  return 'stable';
}

/**
 * Inline percentile to keep dashboard.ts free of cross-module imports.
 * Same impl as in `runner.ts` — both files compute over small arrays so
 * the duplication is fine; folding into a shared util would just create
 * a circular concern.
 */
function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? 0;
  const frac = idx - lo;
  return (sorted[lo] ?? 0) * (1 - frac) + (sorted[hi] ?? 0) * frac;
}

// Helper exported for use by the LlmEvalCompileResult type-narrowing
// path in the dashboard's Markdown generator. Kept local because it's
// only meaningful in the same module.
export function _llmRow(result: LlmEvalCompileResult | undefined): LlmEvalCompileResult | null {
  return result ?? null;
}
