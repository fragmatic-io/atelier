// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wave 8 / Sprint 2.4 — `<MarketplaceScorecardPanel>` baseline primitive.
 *
 * Renders a per-recipe compile-quality scorecard — the five binary checks
 * (`compile` / `schema` / `policy` / `snapshot` / `cost`), the optional
 * cost breakdown when a real-LLM gate produced the data, the
 * `last-eval` timestamp derived from `generated_at`, and the reference-
 * version block. The component is shape-driven: hosts hand it a
 * `CompileQualityScorecard` (sourced from the V-6.e deterministic gate,
 * the S2.1 real-LLM gate, or any host-side aggregator) and the panel
 * renders.
 *
 * The data-shape mirror trick — same one V-6.c used for
 * `MarketplaceAddress` — keeps `@atelier/components` free of a runtime
 * dependency on `@atelier/schemas`. Hosts can pass a schemas-typed value
 * straight through; TypeScript treats the shapes as structurally
 * identical.
 *
 * Composition rule: `MarketplaceScorecardPanel: { can_contain: 'leaf' }`
 * — content is prop-driven; manifest authors do not embed children.
 *
 * The browser primitive (`<MarketplaceBrowser>`) inlines a tiny pill
 * variant of this and opens the full panel on click, but the panel
 * stands alone — hosts can drop it into a recipe-detail page without
 * also bringing the browse list.
 */
import { useMemo, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn } from './_variants.js';

/**
 * Structural mirror of `@atelier/schemas`'s `MarketplaceAddress`. Kept
 * inline so this package stays free of a runtime dep on schemas.
 *
 * NOTE: this duplicates `MarketplaceBrowser`'s mirror so the panel can
 * be used in isolation without importing the browser. The two shapes
 * are structurally identical and a host can pass either through.
 */
export interface ScorecardPanelMarketplaceAddress {
  scheme: 'atelier';
  author: string;
  persona: string;
  version: string;
  raw?: string;
}

/** The canonical names of the five binary checks. */
export type CompileQualityCheck = 'compile' | 'schema' | 'policy' | 'snapshot' | 'cost';

/** Severity of a per-check note. */
export type CompileQualityNoteSeverity = 'error' | 'warning' | 'info';

export interface CompileQualityNote {
  check: CompileQualityCheck;
  severity: CompileQualityNoteSeverity;
  message: string;
}

/**
 * Structural mirror of `CompileQualityScorecard` from `@atelier/schemas`.
 * See `packages/schemas/src/compile-quality-scorecard.ts` for the
 * authoritative definition + prose.
 */
export interface CompileQualityScorecard {
  address: ScorecardPanelMarketplaceAddress;
  generated_at: string;
  reference_versions: {
    capabilities_hash: string;
    components_hash: string;
    compiler_version: string;
  };
  compile_passed: boolean;
  schema_passed: boolean;
  policy_passed: boolean;
  snapshot_stable: boolean;
  cost_within_budget: boolean;
  cost_usd?: number;
  cost_p95_usd?: number;
  compile_duration_ms?: number;
  notes: CompileQualityNote[];
}

/**
 * Summary the pill renders. Mirrors
 * `CompileQualityScorecardSummary` from `@atelier/schemas`.
 */
export interface ScorecardSummary {
  status: 'green' | 'amber' | 'red';
  failedChecks: CompileQualityCheck[];
}

/**
 * Canonical order checks render in. Mirrors
 * `summariseScorecard`'s ordering so the panel rows sit in the same
 * sequence the tooltip / pill exposes.
 */
const CHECK_ORDER: readonly CompileQualityCheck[] = [
  'compile',
  'schema',
  'policy',
  'snapshot',
  'cost',
];

/** Map a check id to the human-readable row label rendered in the panel. */
const CHECK_LABELS: Record<CompileQualityCheck, string> = {
  compile: 'Compile',
  schema: 'Schema',
  policy: 'Policy',
  snapshot: 'Snapshot stable',
  cost: 'Cost within budget',
};

/**
 * Local mirror of `summariseScorecard` from `@atelier/schemas`. Kept
 * inline so the component stays free of a runtime schema dep; the
 * thresholds + canonical order match exactly. A schema-side test pins
 * the behaviour, and this component's tests assert pill colour for each
 * status — divergence is caught either way.
 */
export function summariseScorecardLocal(
  s: Pick<
    CompileQualityScorecard,
    'compile_passed' | 'schema_passed' | 'policy_passed' | 'snapshot_stable' | 'cost_within_budget'
  >,
): ScorecardSummary {
  const failedChecks: CompileQualityCheck[] = [];
  if (!s.compile_passed) failedChecks.push('compile');
  if (!s.schema_passed) failedChecks.push('schema');
  if (!s.policy_passed) failedChecks.push('policy');
  if (!s.snapshot_stable) failedChecks.push('snapshot');
  if (!s.cost_within_budget) failedChecks.push('cost');
  failedChecks.sort((a, b) => CHECK_ORDER.indexOf(a) - CHECK_ORDER.indexOf(b));
  const hardFailed = !s.compile_passed || !s.schema_passed || !s.policy_passed;
  const softFailed = !s.snapshot_stable || !s.cost_within_budget;
  let status: ScorecardSummary['status'];
  if (hardFailed) status = 'red';
  else if (softFailed) status = 'amber';
  else status = 'green';
  return { status, failedChecks };
}

/** Look up the boolean for a given check id on the scorecard. */
function isCheckPassing(s: CompileQualityScorecard, check: CompileQualityCheck): boolean {
  switch (check) {
    case 'compile':
      return s.compile_passed;
    case 'schema':
      return s.schema_passed;
    case 'policy':
      return s.policy_passed;
    case 'snapshot':
      return s.snapshot_stable;
    case 'cost':
      return s.cost_within_budget;
  }
}

/**
 * Format USD with up to four decimal places — sized for the typical
 * cents-per-compile range the LLM eval gate produces (e.g. $0.0042).
 * Trailing zeros are kept so the column aligns when the panel renders
 * both median + p95.
 */
function formatUsd(n: number): string {
  // 4 dp covers the 0.0001 USD floor; anything above $1 trims neatly.
  return `$${n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0')}`;
}

/**
 * Format the p95-cost line: `Compile cost: $0.0042 (p95: $0.0061) ·
 * 1234 ms`. Returns `null` when no cost or duration data was supplied
 * (the deterministic-compile case).
 */
function formatCostLine(s: CompileQualityScorecard): string | null {
  const parts: string[] = [];
  if (s.cost_usd !== undefined) {
    parts.push(`Compile cost: ${formatUsd(s.cost_usd)}`);
  }
  if (s.cost_p95_usd !== undefined) {
    parts.push(`p95: ${formatUsd(s.cost_p95_usd)}`);
  }
  if (s.compile_duration_ms !== undefined) {
    parts.push(`${s.compile_duration_ms} ms`);
  }
  if (parts.length === 0) return null;
  // First two parts paren-grouped, last (duration) joined with a separator.
  if (parts.length === 1) return parts[0]!;
  if (s.cost_usd !== undefined && s.cost_p95_usd !== undefined) {
    const head = `Compile cost: ${formatUsd(s.cost_usd)} (p95: ${formatUsd(s.cost_p95_usd)})`;
    if (s.compile_duration_ms !== undefined) {
      return `${head} · ${s.compile_duration_ms} ms`;
    }
    return head;
  }
  return parts.join(' · ');
}

/** Format the relative-time tail: `(12 hours ago)`, `(just now)`, etc. */
export function formatRelativeTime(generatedAt: string, now: number): string {
  const then = Date.parse(generatedAt);
  if (!Number.isFinite(then)) return '';
  const deltaMs = Math.max(0, now - then);
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? 'minute' : 'minutes'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? 'hour' : 'hours'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} ${day === 1 ? 'day' : 'days'} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} ${mo === 1 ? 'month' : 'months'} ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} ${yr === 1 ? 'year' : 'years'} ago`;
}

/**
 * Format the `Last eval:` line. Renders the ISO timestamp's UTC date +
 * minutes form (e.g. `2026-05-04 04:00 UTC`) followed by the relative
 * tail. The format is stable so docs / tests can pin against it.
 */
export function formatLastEval(generatedAt: string, now: number): string {
  const d = new Date(generatedAt);
  if (Number.isNaN(d.getTime())) return `Last eval: ${generatedAt}`;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const stamp = `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
  const rel = formatRelativeTime(generatedAt, now);
  return rel === '' ? `Last eval: ${stamp}` : `Last eval: ${stamp} (${rel})`;
}

export interface MarketplaceScorecardPanelProps {
  /** The scorecard to render. */
  scorecard: CompileQualityScorecard;
  /**
   * Optional clock injection for the relative-time tail. Defaults to
   * `Date.now`. Tests pin a fixed value so snapshots are stable.
   */
  now?: () => number;
  className?: string;
}

/**
 * Tailwind class set for a scorecard pill. `green` is the default-quiet
 * state; `amber` and `red` lift the contrast.
 */
function pillClass(status: ScorecardSummary['status']): string {
  switch (status) {
    case 'green':
      return 'bg-green-50 text-green-900';
    case 'amber':
      return 'bg-yellow-50 text-yellow-900';
    case 'red':
      return 'bg-red-50 text-red-900';
  }
}

/** Glyph rendered in the per-check row. ✓ for pass, ✗ for fail. */
function checkGlyph(passed: boolean): string {
  return passed ? '✓' : '✗';
}

export function MarketplaceScorecardPanel({
  scorecard,
  now = Date.now,
  className,
}: MarketplaceScorecardPanelProps): ReactNode {
  const summary = useMemo(() => summariseScorecardLocal(scorecard), [scorecard]);
  const costLine = formatCostLine(scorecard);
  // Group notes by check so the per-row notes appear under their row.
  const notesByCheck = useMemo(() => {
    const out: Partial<Record<CompileQualityCheck, CompileQualityNote[]>> = {};
    for (const note of scorecard.notes) {
      const arr = out[note.check] ?? [];
      arr.push(note);
      out[note.check] = arr;
    }
    return out;
  }, [scorecard.notes]);
  const lastEval = formatLastEval(scorecard.generated_at, now());

  return (
    <div
      data-cir-component="MarketplaceScorecardPanel"
      data-scorecard-status={summary.status}
      role="group"
      aria-label="Compile-quality scorecard"
      className={cn('flex flex-col gap-3 p-4 rounded-md border border-gray-200', className)}
    >
      <header
        data-cir-part="scorecard-header"
        className={cn('flex items-baseline gap-2 flex-wrap')}
      >
        <span
          data-cir-part="scorecard-pill"
          data-scorecard-status={summary.status}
          className={cn('text-xs px-1.5 py-0.5 rounded-full', pillClass(summary.status))}
        >
          {summary.status === 'green'
            ? 'All checks passing'
            : summary.status === 'amber'
              ? `${summary.failedChecks.length} warning${summary.failedChecks.length === 1 ? '' : 's'}`
              : `${summary.failedChecks.length} failing`}
        </span>
        <span className={cn('text-xs text-gray-600')}>{lastEval}</span>
      </header>
      <ul data-cir-part="scorecard-checks" role="list" className={cn('flex flex-col gap-1.5')}>
        {CHECK_ORDER.map((check) => {
          const passed = isCheckPassing(scorecard, check);
          const notes = notesByCheck[check] ?? [];
          return (
            <li
              key={check}
              role="listitem"
              data-cir-part="scorecard-check-row"
              data-check={check}
              data-check-passed={passed ? 'true' : 'false'}
              className={cn('flex flex-col gap-0.5')}
            >
              <div className={cn('flex items-baseline gap-2')}>
                <span
                  data-cir-part="scorecard-check-glyph"
                  className={cn(
                    'text-sm font-semibold',
                    passed ? 'text-green-700' : 'text-red-700',
                  )}
                  aria-hidden="true"
                >
                  {checkGlyph(passed)}
                </span>
                <span data-cir-part="scorecard-check-label" className={cn('text-sm')}>
                  {CHECK_LABELS[check]}
                </span>
              </div>
              {notes.map((note, idx) => (
                <p
                  key={idx}
                  data-cir-part="scorecard-check-note"
                  data-note-severity={note.severity}
                  className={cn('text-xs text-gray-600 ml-6')}
                >
                  {note.message}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
      {costLine !== null ? (
        <div data-cir-part="scorecard-cost" className={cn('text-sm text-gray-700')}>
          {costLine}
        </div>
      ) : null}
      <dl
        data-cir-part="scorecard-reference-versions"
        className={cn('text-xs text-gray-600 grid grid-cols-[max-content_1fr] gap-x-2 gap-y-1')}
      >
        <dt className={cn('font-semibold')}>capabilities_hash</dt>
        <dd className={cn('font-mono')}>{scorecard.reference_versions.capabilities_hash}</dd>
        <dt className={cn('font-semibold')}>components_hash</dt>
        <dd className={cn('font-mono')}>{scorecard.reference_versions.components_hash}</dd>
        <dt className={cn('font-semibold')}>compiler_version</dt>
        <dd className={cn('font-mono')}>{scorecard.reference_versions.compiler_version}</dd>
      </dl>
    </div>
  );
}
MarketplaceScorecardPanel.displayName = 'MarketplaceScorecardPanel';

export function marketplaceScorecardPanelTextRender(props: MarketplaceScorecardPanelProps): string {
  const summary = summariseScorecardLocal(props.scorecard);
  if (summary.status === 'green') return '[MarketplaceScorecardPanel: green]';
  return `[MarketplaceScorecardPanel: ${summary.status} (${summary.failedChecks.join(', ')})]`;
}

export const MarketplaceScorecardPanelBinding: ComponentBinding = {
  id: 'MarketplaceScorecardPanel',
  factory: MarketplaceScorecardPanel as ComponentBinding['factory'],
};
