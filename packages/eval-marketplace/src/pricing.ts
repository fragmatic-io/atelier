// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Gemini pricing tables — source of truth for the real-LLM eval gate's cost
 * column. Intentionally small + easy to bump when Google rotates pricing.
 *
 * Numbers below are quoted in **USD per 1M tokens** as listed on Google's
 * AI pricing page (cross-checked 2026-05-03 against the public price list
 * for `gemini-2.5-flash` and `gemini-2.5-pro`). Update the constants and
 * bump `PRICING_REVISION` when the upstream sheet changes — the revision
 * lands in `EvalReport.summary.pricing_revision` so old reports remain
 * reproducible.
 *
 * The S2.1 marketplace LLM eval defaults to `gemini-2.5-flash` (the cheap
 * tier — sub-cent per persona at typical token counts). Hosts that want to
 * exercise the cold-compile model substitute their own `compile` impl.
 */

/** Stable revision string for the pricing table itself. */
export const PRICING_REVISION = '2026-05-03';

/**
 * Per-model pricing in **USD per 1M tokens**. Gemini bills input + output
 * separately; we store both. Output tokens are typically ~3-4x more
 * expensive than input — keeping them split gives the cost dashboard real
 * signal.
 */
export interface ModelPricing {
  /** USD per 1M input tokens. */
  input_per_1m: number;
  /** USD per 1M output tokens. */
  output_per_1m: number;
}

export const GEMINI_PRICING: Readonly<Record<string, ModelPricing>> = Object.freeze({
  // Cheap tier — what the marketplace LLM eval gate uses by default.
  'gemini-2.5-flash': { input_per_1m: 0.3, output_per_1m: 2.5 },
  // Heavy tier — cold compiles. Carried for hosts that wire it into the
  // gate; the dashboard reads this row when the compiler reports
  // `gemini-2.5-pro` as its model id.
  'gemini-2.5-pro': { input_per_1m: 1.25, output_per_1m: 10.0 },
  // Cheaper still — older default used by some hosts; carried for
  // historical reports. Leaving as-is so old report JSON keeps costing
  // out cleanly.
  'gemini-1.5-flash': { input_per_1m: 0.075, output_per_1m: 0.3 },
  'gemini-1.5-pro': { input_per_1m: 1.25, output_per_1m: 5.0 },
});

/**
 * Compute the USD cost of a single compile given the model id and the
 * per-call token counts. Falls back to `gemini-2.5-flash` when the model
 * is unrecognised — the cost is recorded but the report's
 * `pricing_revision` stays clean. Hosts that want a strict mode wrap this
 * with their own preflight.
 *
 * Returns USD as a number (not formatted) so downstream aggregators can
 * sum without re-parsing. Round at the presentation layer.
 */
export function costUsdFor(model: string, tokensInput: number, tokensOutput: number): number {
  const row = GEMINI_PRICING[model] ?? GEMINI_PRICING['gemini-2.5-flash'];
  // Defensive: if an op-debt slip removes flash from the table, use a
  // sane zero-cost fallback rather than crashing the report. The
  // dashboard surfaces the model id so the gap is visible.
  if (row === undefined) return 0;
  const inputCost = (tokensInput * row.input_per_1m) / 1_000_000;
  const outputCost = (tokensOutput * row.output_per_1m) / 1_000_000;
  return inputCost + outputCost;
}

/**
 * Lookup the pricing row for a model id. Returns `undefined` (not a
 * fallback) when the model is unknown — useful for tooling that needs to
 * surface a "we don't price this model" warning explicitly.
 */
export function pricingFor(model: string): ModelPricing | undefined {
  return GEMINI_PRICING[model];
}
