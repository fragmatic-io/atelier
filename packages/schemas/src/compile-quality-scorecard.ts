// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Compile-quality scorecard — Sprint 2.4 (P3.2 §"Recipe-quality scorecards").
 *
 * The marketplace's V-6.c `<MarketplaceBrowser>` lists / filters / previews
 * recipes; V-6.d adds the curated review pill. Sprint 2.4 deepens the
 * signal: each persona surfaces a per-recipe scorecard that answers the
 * question "does this thing currently pass the eval gate?".
 *
 * The schema is the wire shape the host hands to `<MarketplaceBrowser>`
 * via the optional `MarketplaceClient.scorecard?(address)` seam. Hosts can
 * source it from any of three places that produce the same shape:
 *
 *  1. **V-6.e nightly deterministic gate** (`@atelier/eval-marketplace`).
 *     `cost_usd` / `cost_p95_usd` / `compile_duration_ms` are absent —
 *     the deterministic compile has no token cost and the per-persona
 *     duration is a CI artifact, not a per-recipe metric.
 *  2. **S2.1 real-LLM eval suite** (sibling agent's `@atelier/eval-llm`).
 *     Carries the `cost_usd` / `cost_p95_usd` numbers and the duration
 *     measured against the real model. The shape is the same so the UI
 *     does not need to branch on source.
 *  3. **Hybrid** — host-side aggregation of both. Take the deterministic
 *     pass/fail booleans, fold in the real-LLM cost numbers; the
 *     summariser still works.
 *
 * The five binary checks (`compile_passed`, `schema_passed`,
 * `policy_passed`, `snapshot_stable`, `cost_within_budget`) map 1:1 to
 * the bullet points in P3.2:
 *
 *   compile-passed Y/N · schema-passed Y/N · policies-passed Y/N ·
 *   snapshot-stable Y/N · cost-budget-respected Y/N
 *
 * `summariseScorecard` collapses the booleans into a single
 * green / amber / red status the browse UI can paint as a pill. The
 * thresholds are intentionally simple (and exhaustively unit-tested):
 *
 *   - **green**: every check passes.
 *   - **amber**: snapshot or cost fail, but compile / schema / policy
 *     still pass. This is the "warning" band — the recipe still works,
 *     it's just drifted a little (manifest shape changed) or got more
 *     expensive (cost ticked over budget). Worth surfacing, not worth
 *     blocking.
 *   - **red**: compile, schema, or policy fails. Hard regression — the
 *     manifest doesn't typecheck, the compile bombed, or a baseline
 *     policy fired error-severity. Do not install without diagnosing.
 *
 * The schema lives next to the marketplace primitives because the
 * scorecard's `address` keys against `MarketplaceAddressSchema` — keeping
 * them adjacent means a future cross-reference policy
 * (e.g. "scorecard.address must match an approved review record") has
 * one import path to chase.
 *
 * Companion docs: `apps/docs/src/content/docs/marketplace/browse.mdx`
 * walks the rendered surface; `TODO.md` §P3.2 is the parent spec.
 */
import { z } from 'zod';

import { IsoDateTimeString } from './common.js';
import { MarketplaceAddressSchema } from './marketplace.js';

/**
 * The five binary checks the marketplace browse UI surfaces. Pulled out
 * as its own enum so the per-check `notes` array can name the failing
 * check without hard-coding strings at the call sites.
 */
export const CompileQualityCheckSchema = z.enum([
  'compile',
  'schema',
  'policy',
  'snapshot',
  'cost',
]);
export type CompileQualityCheck = z.infer<typeof CompileQualityCheckSchema>;

/**
 * Severity of a per-check note. Mirrors the `EvalViolation` severity
 * shape from `@atelier/eval-marketplace` (minus the `'warn'` alias —
 * scorecards normalise to the canonical `'warning'`) and adds `'info'`
 * for non-failure annotations the host wants to surface (e.g. "fixture
 * bumped between this run and the previous one").
 */
export const CompileQualityNoteSeveritySchema = z.enum(['error', 'warning', 'info']);
export type CompileQualityNoteSeverity = z.infer<typeof CompileQualityNoteSeveritySchema>;

/**
 * One per-check note. Hosts attach these for failed checks (and, less
 * commonly, for info-severity advisories on passing checks). The browse
 * UI's expanded scorecard panel surfaces them inline beneath each check
 * row.
 */
export const CompileQualityNoteSchema = z.object({
  check: CompileQualityCheckSchema,
  severity: CompileQualityNoteSeveritySchema,
  message: z.string(),
});
export type CompileQualityNote = z.infer<typeof CompileQualityNoteSchema>;

/**
 * Reference-version block. Same fields the `@atelier/eval-marketplace`
 * `EvalReport` carries — pinning these in the scorecard means a UI that
 * shows "last eval" can also show what the eval was run against, which
 * is the difference between a useful regression report and a screenshot
 * of three booleans.
 */
export const CompileQualityReferenceVersionsSchema = z.object({
  capabilities_hash: z.string(),
  components_hash: z.string(),
  compiler_version: z.string(),
});
export type CompileQualityReferenceVersions = z.infer<typeof CompileQualityReferenceVersionsSchema>;

/**
 * The wire shape `<MarketplaceBrowser>` consumes via
 * `MarketplaceClient.scorecard?(address)`. See the file header for the
 * source / shape contract.
 */
export const CompileQualityScorecardSchema = z.object({
  /** The address this scorecard covers — keys 1:1 with the marketplace listing. */
  address: MarketplaceAddressSchema,
  /** ISO-8601 UTC timestamp at the moment the scorecard was produced. */
  generated_at: IsoDateTimeString,
  /** Reference fixture / compiler version pin. See `CompileQualityReferenceVersionsSchema`. */
  reference_versions: CompileQualityReferenceVersionsSchema,
  // -- The five binary checks. -------------------------------------------
  /** Compile finished without error (the LLM / fallback produced a manifest). */
  compile_passed: z.boolean(),
  /** Compiled manifest validated against `ManifestSchema`. */
  schema_passed: z.boolean(),
  /** No error-severity baseline policy violations fired. */
  policy_passed: z.boolean(),
  /** `manifest_shape_hash` matches the previously-recorded baseline. */
  snapshot_stable: z.boolean(),
  /** p95 compile cost <= the persona's declared compile budget. */
  cost_within_budget: z.boolean(),
  // -- Optional metrics (real-LLM gates only). ---------------------------
  /** Median compile cost in USD. Absent for deterministic-compile sources. */
  cost_usd: z.number().optional(),
  /** p95 compile cost in USD. Absent for deterministic-compile sources. */
  cost_p95_usd: z.number().optional(),
  /** Wall-clock duration of the compile, milliseconds. */
  compile_duration_ms: z.number().optional(),
  // -- Per-check notes. --------------------------------------------------
  /**
   * Per-check notes. Typically present for the failed checks; hosts may
   * also attach info-severity notes on passing checks. The UI groups
   * notes by `check` when rendering the expanded panel.
   */
  notes: z.array(CompileQualityNoteSchema),
});
export type CompileQualityScorecard = z.infer<typeof CompileQualityScorecardSchema>;

/**
 * The summarised status the browse UI paints as a pill. `green` /
 * `amber` / `red` keys the dot colour; `failedChecks` is the
 * canonically-ordered list of check ids that did NOT pass — the tooltip
 * renders these on hover, and the expanded panel highlights matching
 * rows.
 */
export interface CompileQualityScorecardSummary {
  status: 'green' | 'amber' | 'red';
  failedChecks: CompileQualityCheck[];
}

/**
 * The canonical order check failures appear in the summary's
 * `failedChecks` array. Mirrors the order the rows render in the
 * expanded panel so a user reading the tooltip sees the same sequence
 * they will see when they click through.
 */
const SUMMARY_CHECK_ORDER: readonly CompileQualityCheck[] = [
  'compile',
  'schema',
  'policy',
  'snapshot',
  'cost',
];

/**
 * Collapse a `CompileQualityScorecard` into its summarised pill status.
 *
 * Status thresholds (see file header for prose):
 *
 *   - **red**   — `compile`, `schema`, or `policy` failed. Hard regression.
 *   - **amber** — only `snapshot` and/or `cost` failed. Soft warning.
 *   - **green** — every check passed.
 *
 * The function is total — every input shape produces a status. It does
 * NOT inspect `notes`; only the five booleans drive the colour. (Notes
 * are surfaced verbatim by the UI; their severity is informational.)
 */
export function summariseScorecard(
  scorecard: Pick<
    CompileQualityScorecard,
    'compile_passed' | 'schema_passed' | 'policy_passed' | 'snapshot_stable' | 'cost_within_budget'
  >,
): CompileQualityScorecardSummary {
  const failedChecks: CompileQualityCheck[] = [];
  if (!scorecard.compile_passed) failedChecks.push('compile');
  if (!scorecard.schema_passed) failedChecks.push('schema');
  if (!scorecard.policy_passed) failedChecks.push('policy');
  if (!scorecard.snapshot_stable) failedChecks.push('snapshot');
  if (!scorecard.cost_within_budget) failedChecks.push('cost');

  // Sort by canonical order — if the fields above are ever reordered the
  // tooltip and panel still render in a stable sequence.
  failedChecks.sort((a, b) => SUMMARY_CHECK_ORDER.indexOf(a) - SUMMARY_CHECK_ORDER.indexOf(b));

  // Red beats amber beats green. The check classes:
  //   hard:  compile / schema / policy
  //   soft:  snapshot / cost
  const hardFailed =
    !scorecard.compile_passed || !scorecard.schema_passed || !scorecard.policy_passed;
  const softFailed = !scorecard.snapshot_stable || !scorecard.cost_within_budget;

  let status: CompileQualityScorecardSummary['status'];
  if (hardFailed) {
    status = 'red';
  } else if (softFailed) {
    status = 'amber';
  } else {
    status = 'green';
  }
  return { status, failedChecks };
}
