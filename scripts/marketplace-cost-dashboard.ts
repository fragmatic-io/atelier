// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/* eslint-disable no-console */
/**
 * `pnpm marketplace-cost-dashboard` — S2.2 dashboard generator.
 *
 * Walks `eval-reports/` for every committed `EvalReport`, hands them to
 * `summariseLastNRuns` from `@atelier/eval-marketplace`, and emits two
 * outputs:
 *
 *   1. `eval-reports/cost-dashboard.json` — the raw `CostSummary` shape.
 *      Useful for any downstream tool (a Pages widget, a sales deck, an
 *      internal audit) that wants the numbers without re-parsing the
 *      MDX.
 *   2. `apps/docs/src/content/docs/operations/cost-dashboard.mdx` — the
 *      docs-site page rendered from the same data. Idempotent: identical
 *      input produces byte-identical output, so committing the file in
 *      CI doesn't churn unrelated bits.
 *
 * The CI workflow runs this AFTER each `marketplace-eval-llm.yml` run +
 * commits the regenerated MDX page back to main with a bot signature.
 *
 * Argv:
 *   --reports-dir <path>   directory containing `*.json` EvalReports.
 *                          Default: `eval-reports/` at repo root.
 *   --window <n>           keep the last n reports for the rolling
 *                          window. Default: 30 (covers the 30-day spend
 *                          window with one run per day).
 *   --json-out <path>      write the JSON summary here. Default
 *                          `eval-reports/cost-dashboard.json`.
 *   --mdx-out <path>       write the MDX dashboard here. Default
 *                          `apps/docs/src/content/docs/operations/cost-dashboard.mdx`.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  summariseLastNRuns,
  type CostSummary,
  type CostSummaryPersona,
  type EvalReport,
} from '@atelier/eval-marketplace';

interface CliArgs {
  reportsDir: string;
  window: number;
  jsonOut: string;
  mdxOut: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    reportsDir: 'eval-reports',
    window: 30,
    jsonOut: 'eval-reports/cost-dashboard.json',
    mdxOut: 'apps/docs/src/content/docs/operations/cost-dashboard.mdx',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case '--reports-dir':
        args.reportsDir = expectValue(argv, i);
        i += 1;
        break;
      case '--window':
        args.window = Number.parseInt(expectValue(argv, i), 10);
        i += 1;
        break;
      case '--json-out':
        args.jsonOut = expectValue(argv, i);
        i += 1;
        break;
      case '--mdx-out':
        args.mdxOut = expectValue(argv, i);
        i += 1;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`unknown flag: ${String(a)}`);
        printHelp();
        process.exit(2);
    }
  }
  return args;
}

function expectValue(argv: string[], i: number): string {
  const v = argv[i + 1];
  if (v === undefined) {
    console.error(`missing value for ${String(argv[i])}`);
    process.exit(2);
  }
  return v;
}

function printHelp(): void {
  console.log(
    [
      'pnpm marketplace-cost-dashboard — S2.2 cost dashboard generator',
      '',
      'flags:',
      '  --reports-dir <path>   reports input directory (default eval-reports)',
      '  --window <n>           keep last n reports (default 30)',
      '  --json-out <path>      JSON output path',
      '  --mdx-out <path>       MDX output path',
    ].join('\n'),
  );
}

/**
 * Load every `*.json` file under `reportsDir` and parse it as an
 * `EvalReport`. Skips:
 *   - the dashboard's own JSON output (`cost-dashboard.json`);
 *   - any file that fails to parse — log a warning so a corrupt report
 *     doesn't take down the pipeline.
 */
function loadReports(dir: string): EvalReport[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    console.warn(`[cost-dashboard] reports dir ${dir} not readable: ${(err as Error).message}`);
    return [];
  }
  const reports: EvalReport[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    if (entry === 'cost-dashboard.json') continue;
    const path = resolve(dir, entry);
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch (err) {
      console.warn(`[cost-dashboard] could not read ${path}: ${(err as Error).message}`);
      continue;
    }
    try {
      const parsed = JSON.parse(text) as EvalReport;
      reports.push(parsed);
    } catch (err) {
      console.warn(`[cost-dashboard] bad JSON in ${path}: ${(err as Error).message}`);
    }
  }
  return reports;
}

/**
 * Format a USD number to 4 decimal places with a leading `$` sign. Keeps
 * the dashboard table readable even for sub-cent costs (the marketplace
 * gate's typical range is $0.001 — $0.05 per persona).
 */
function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

/**
 * Trend chevron — ASCII so the rendered MDX has no font-loading
 * surprises. `up` means cost went up (bad); `down` means cost dropped
 * (good); `stable` is the band-around-zero case.
 */
function fmtTrend(t: CostSummaryPersona['trend']): string {
  switch (t) {
    case 'up':
      return '^ up';
    case 'down':
      return 'v down';
    default:
      return '- stable';
  }
}

/**
 * Render the dashboard JSON to a Starlight MDX page. Pure string-ops so
 * the output is reproducible — no template engine in the loop. The
 * frontmatter carries a stable title so the page slug never moves.
 *
 * The "auto-generated" banner discourages manual edits — the file IS
 * regenerated on every CI run, so any hand changes get clobbered.
 */
function renderMdx(summary: CostSummary): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push('title: Cost dashboard');
  lines.push(
    'description: Per-persona compile cost across the marketplace LLM eval gate. Auto-generated.',
  );
  lines.push('---');
  lines.push('');
  lines.push(
    '> **Auto-generated.** This page is rewritten by `scripts/marketplace-cost-dashboard.ts`',
  );
  lines.push('> on every `marketplace-eval-llm.yml` run. Hand edits will be clobbered — touch the');
  lines.push('> generator instead.');
  lines.push('');
  lines.push('The marketplace LLM eval gate compiles the top-N personas through real Gemini every');
  lines.push(
    'night and records token + cost telemetry per persona. This page summarises the trailing',
  );
  lines.push('window so cost regressions are visible at a glance.');
  lines.push('');
  lines.push('## Persona source');
  lines.push('');
  lines.push(
    'The gate reads personas from one of two sources, picked by `marketplace-eval-llm.yml`:',
  );
  lines.push('');
  lines.push('- **Local fixtures (default)** — `pnpm marketplace:eval --local-fixtures recipes`');
  lines.push('  walks the in-tree `recipes/` directory, parses each `*.json` / `*.recipe.json`');
  lines.push('  file as a recipe, and synthesises a canonical `atelier://local/<file>@1.0.0`');
  lines.push('  address per persona. Signature verification is skipped (local files are unsigned)');
  lines.push('  and `signature_verified: false` is recorded on every persona slot. Use this when');
  lines.push('  no hosted vault corpus exists yet — the default the workflow runs.');
  lines.push(
    '- **Hosted vault** — `pnpm marketplace:eval --vault-url <url>` fetches signed bundles',
  );
  lines.push('  over HTTP from a vault server. Verifies the ed25519 signature and records');
  lines.push('  `signature_verified: true` per persona. Set the `MARKETPLACE_VAULT_URL` repo');
  lines.push('  secret to flip the workflow into this mode.');
  lines.push('');
  lines.push('The compile + validation pipeline (schema parse, route compile, policy stack,');
  lines.push(
    'shape hash) is identical across both sources — the only observable difference is the',
  );
  lines.push('`signature_verified` flag and the synthesised vs. fetched address.');
  lines.push('');

  if (summary.runs_seen === 0) {
    lines.push('## No data yet');
    lines.push('');
    lines.push('`eval-reports/` is empty. The first nightly run of `marketplace-eval-llm.yml`');
    lines.push('will populate this dashboard on the next 04:30 UTC tick.');
    lines.push('');
    lines.push(`_Generated at \`${summary.generated_at}\`._`);
    lines.push('');
    return lines.join('\n');
  }

  // Latest-run row — the headline number.
  if (summary.latest_run !== null) {
    lines.push('## Latest run');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    lines.push(`| Generated at | \`${summary.latest_run.generated_at}\` |`);
    lines.push(`| Total cost | ${fmtUsd(summary.latest_run.total_cost_usd)} |`);
    lines.push(`| Avg per persona | ${fmtUsd(summary.latest_run.cost_per_persona_avg_usd)} |`);
    lines.push(`| p95 per persona | ${fmtUsd(summary.latest_run.cost_per_persona_p95_usd)} |`);
    lines.push(`| Pass rate | ${(summary.latest_run.pass_rate * 100).toFixed(1)}% |`);
    lines.push(`| Pricing revision | \`${summary.latest_run.pricing_revision}\` |`);
    lines.push('');
  }

  // Rolling-window spend.
  lines.push('## Rolling window spend');
  lines.push('');
  lines.push('| Window | USD spent |');
  lines.push('| --- | --- |');
  lines.push(`| Last 7 days | ${fmtUsd(summary.spend_last_7_days_usd)} |`);
  lines.push(`| Last 30 days | ${fmtUsd(summary.spend_last_30_days_usd)} |`);
  lines.push('');

  // Top-5 most expensive.
  if (summary.top_5_most_expensive.length > 0) {
    lines.push('## Top 5 most expensive personas');
    lines.push('');
    lines.push('| Persona | Avg USD | p95 USD | Trend | Runs |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const p of summary.top_5_most_expensive) {
      lines.push(
        `| \`${p.address}\` | ${fmtUsd(p.avg_usd)} | ${fmtUsd(p.p95_usd)} | ${fmtTrend(p.trend)} | ${p.appearances} |`,
      );
    }
    lines.push('');
  }

  // Full per-persona table.
  lines.push('## All personas');
  lines.push('');
  lines.push('| Persona | Avg USD | p95 USD | Trend | Runs | Latest model |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const p of summary.personas) {
    lines.push(
      `| \`${p.address}\` | ${fmtUsd(p.avg_usd)} | ${fmtUsd(p.p95_usd)} | ${fmtTrend(p.trend)} | ${p.appearances} | \`${p.latest_model}\` |`,
    );
  }
  lines.push('');

  // Window meta.
  lines.push('## Window');
  lines.push('');
  lines.push(`- Reports seen: **${summary.runs_seen}**`);
  if (summary.window_start !== null) {
    lines.push(`- Window start: \`${summary.window_start}\``);
  }
  if (summary.window_end !== null) {
    lines.push(`- Window end: \`${summary.window_end}\``);
  }
  lines.push(`- Generated at: \`${summary.generated_at}\``);
  lines.push('');

  lines.push('## Related');
  lines.push('');
  lines.push('- [Operations → Cost control](/operations/cost-control/)');
  lines.push('- [Marketplace → Eval gate](/marketplace/eval-gate/)');
  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const reports = loadReports(args.reportsDir);
  const summary = summariseLastNRuns(reports, args.window);

  const jsonPath = resolve(args.jsonOut);
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const mdxPath = resolve(args.mdxOut);
  mkdirSync(dirname(mdxPath), { recursive: true });
  writeFileSync(mdxPath, renderMdx(summary), 'utf8');

  console.log(
    `[cost-dashboard] ${String(summary.runs_seen)} runs aggregated → ${args.jsonOut} + ${args.mdxOut}`,
  );
  if (summary.latest_run !== null) {
    console.log(
      `[cost-dashboard] latest run: ${fmtUsd(summary.latest_run.total_cost_usd)} ` +
        `(avg ${fmtUsd(summary.latest_run.cost_per_persona_avg_usd)}, ` +
        `p95 ${fmtUsd(summary.latest_run.cost_per_persona_p95_usd)})`,
    );
  }
}

main();
