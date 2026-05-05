// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/* eslint-disable no-console */
/**
 * `pnpm marketplace:eval` — V-6.e CLI shim.
 *
 * Pulls the top-N currently-approved personas off the configured vault,
 * runs them through the eval gate, writes the report to a JSON file, and
 * exits 0 (clean) / 1 (failures present) / 2 (internal error). The
 * GitHub Action wrapping this script uploads the JSON as a 90-day
 * artifact + opens an issue when the gate fails.
 *
 * Argv:
 *   --vault-url <url>    base URL of the marketplace vault. Mutually
 *                        exclusive with `--local-fixtures`. Defaults to
 *                        `MARKETPLACE_VAULT_URL` env var if set; when
 *                        neither flag nor env var is supplied, the CLI
 *                        falls back to local-fixtures mode against the
 *                        in-tree `recipes/` directory.
 *   --local-fixtures <d> read recipes from local directory `d` instead
 *                        of fetching them over HTTP. Each `*.json` /
 *                        `*.recipe.json` file becomes a persona at
 *                        `atelier://local/<filename>@1.0.0`. Signature
 *                        verification is skipped (local files are
 *                        unsigned) and `signature_verified: false` is
 *                        recorded per persona.
 *   --top <n>            cap on personas evaluated. Default 10.
 *   --strict             treat warn-severity violations as failures.
 *   --out <path>         where to write the JSON report. Default
 *                        `eval-results/marketplace.json`.
 *
 * The "approved persona" source: V-6.d hasn't shipped, so the CLI lists
 * personas via a pluggable strategy:
 *   - if `--local-fixtures <dir>` is set (or its env equivalent), walk
 *     the directory directly — no wire hop, no signature.
 *   - if `--vault-url` is reachable, GET `<vaultUrl>/marketplace/personas`
 *     (a list endpoint the vault server is expected to expose under
 *     V-6.d). Until that endpoint exists, the call returns 404 and the
 *     CLI falls back to the empty list — the gate runs, finds no work,
 *     reports 0/0/0 and exits 0.
 *   - if the env var `MARKETPLACE_EVAL_FIXTURE` points at a JSON file
 *     containing an `MarketplaceAddress[]`, that list is used directly
 *     (smoke-test path). Useful for local dev + the integration tests.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  DEFAULT_FIXTURES,
  httpBundleFetcher,
  loadLocalFixtures,
  runMarketplaceEval,
  type ApprovedPersonaList,
  type BundleFetcher,
  type EvalReport,
} from '@atelier/eval-marketplace';
import { parseMarketplaceAddress, type MarketplaceAddress } from '@atelier/schemas';

interface CliArgs {
  /** Vault URL — set only when `localFixtures` is undefined. */
  vaultUrl: string | undefined;
  /** Local-fixtures directory — set only when `vaultUrl` is undefined. */
  localFixtures: string | undefined;
  top: number;
  strict: boolean;
  out: string;
  mode: 'deterministic' | 'real-llm';
  llmModel: string;
}

function parseArgs(argv: string[]): CliArgs {
  // Source order of precedence (highest first): explicit `--vault-url` /
  // `--local-fixtures` flag → matching env var → no source. The args
  // object below records the env-var defaults; CLI flag handlers
  // overwrite them. `validateSource` (below) enforces mutual exclusion.
  const args: CliArgs = {
    vaultUrl: process.env['MARKETPLACE_VAULT_URL'],
    localFixtures: process.env['MARKETPLACE_LOCAL_FIXTURES'],
    top: 10,
    strict: false,
    out: 'eval-results/marketplace.json',
    mode: 'deterministic',
    llmModel: process.env['GEMINI_COLD_MODEL'] ?? 'gemini-2.5-flash',
  };
  // Track whether the source flag was explicitly set on argv (vs. via
  // env var). Argv-set wins over env, and an explicit argv flag also
  // unsets the OTHER source — passing `--local-fixtures` clears any
  // `MARKETPLACE_VAULT_URL` env default.
  let vaultExplicit = false;
  let localExplicit = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    // Support both `--mode=real-llm` and `--mode real-llm` for ergonomics.
    if (typeof a === 'string' && a.startsWith('--mode=')) {
      const v = a.slice('--mode='.length);
      args.mode = parseModeValue(v);
      continue;
    }
    if (typeof a === 'string' && a.startsWith('--top=')) {
      args.top = Number.parseInt(a.slice('--top='.length), 10);
      continue;
    }
    if (typeof a === 'string' && a.startsWith('--local-fixtures=')) {
      args.localFixtures = a.slice('--local-fixtures='.length);
      localExplicit = true;
      continue;
    }
    switch (a) {
      case '--vault-url':
        args.vaultUrl = expectValue(argv, i);
        vaultExplicit = true;
        i += 1;
        break;
      case '--local-fixtures':
        args.localFixtures = expectValue(argv, i);
        localExplicit = true;
        i += 1;
        break;
      case '--top':
        args.top = Number.parseInt(expectValue(argv, i), 10);
        i += 1;
        break;
      case '--strict':
        args.strict = true;
        break;
      case '--out':
        args.out = expectValue(argv, i);
        i += 1;
        break;
      case '--mode':
        args.mode = parseModeValue(expectValue(argv, i));
        i += 1;
        break;
      case '--llm-model':
        args.llmModel = expectValue(argv, i);
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
  // Mutual exclusion: an explicit argv flag wins and clears the OTHER
  // source so a stale env var doesn't surprise the operator.
  if (localExplicit) args.vaultUrl = undefined;
  if (vaultExplicit) args.localFixtures = undefined;
  // If both still set (both via env var), refuse to boot — operator
  // needs to disambiguate.
  if (args.vaultUrl !== undefined && args.localFixtures !== undefined) {
    console.error(
      '[marketplace-eval] both MARKETPLACE_VAULT_URL and MARKETPLACE_LOCAL_FIXTURES are set; ' +
        'pass --vault-url <url> or --local-fixtures <dir> explicitly to disambiguate.',
    );
    process.exit(2);
  }
  return args;
}

function parseModeValue(v: string): 'deterministic' | 'real-llm' {
  if (v === 'deterministic' || v === 'real-llm') return v;
  console.error(`invalid --mode value: ${v} (expected 'deterministic' or 'real-llm')`);
  process.exit(2);
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
      'pnpm marketplace:eval — V-6.e nightly eval gate',
      '',
      'persona source (mutually exclusive — pick one):',
      '  --vault-url <url>      base URL of a hosted marketplace vault',
      '  --local-fixtures <dir> directory of *.json recipe files (no signing)',
      '',
      'other flags:',
      '  --top <n>              cap on personas evaluated (default 10)',
      '  --strict               treat warn-severity violations as failures',
      '  --out <path>           report output path (default eval-results/marketplace.json)',
      '  --mode <mode>          deterministic (default) | real-llm — S2.1',
      '  --llm-model <id>       gemini model id when --mode=real-llm (default gemini-2.5-flash)',
      '',
      'env:',
      '  MARKETPLACE_VAULT_URL          alternate to --vault-url',
      '  MARKETPLACE_LOCAL_FIXTURES     alternate to --local-fixtures',
      '  MARKETPLACE_EVAL_FIXTURE       JSON file with persona address list (smoke path)',
      '  GEMINI_API_KEY                 required when --mode=real-llm',
    ].join('\n'),
  );
}

/**
 * Strategy 1: env-fixture file. When `MARKETPLACE_EVAL_FIXTURE` points at
 * a JSON file containing either an array of canonical address strings or
 * an array of `MarketplaceAddress` objects, parse it directly. Used by
 * local dev + the in-repo smoke harness.
 */
function loadFixtureApproved(): ApprovedPersonaList | null {
  const path = process.env['MARKETPLACE_EVAL_FIXTURE'];
  if (path === undefined) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(path), 'utf8'));
  } catch (err) {
    console.warn(`[marketplace-eval] could not load fixture ${path}: ${(err as Error).message}`);
    return null;
  }
  if (!Array.isArray(raw)) {
    console.warn(`[marketplace-eval] fixture ${path} is not an array — falling back`);
    return null;
  }
  const addresses: MarketplaceAddress[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const parsed = parseMarketplaceAddress(entry);
      if (parsed !== null) addresses.push(parsed);
    } else if (
      entry !== null &&
      typeof entry === 'object' &&
      'author' in entry &&
      'persona' in entry &&
      'version' in entry
    ) {
      const e = entry as Record<string, unknown>;
      addresses.push({
        scheme: 'atelier',
        author: String(e['author']),
        persona: String(e['persona']),
        version: String(e['version']),
      });
    }
  }
  return { list: () => addresses };
}

/**
 * Strategy 2: HTTP. Fetch `<vaultUrl>/marketplace/personas` and parse
 * the JSON body as `MarketplaceAddress[] | { addresses: ... }`. Returns
 * an empty list on 404 (V-6.d not yet shipped) — the gate still runs
 * cleanly with 0 personas.
 */
function httpApproved(vaultUrl: string): ApprovedPersonaList {
  return {
    async list(): Promise<MarketplaceAddress[]> {
      const url = `${vaultUrl.replace(/\/$/, '')}/marketplace/personas`;
      let res: Response;
      try {
        res = await fetch(url);
      } catch {
        return [];
      }
      if (res.status === 404) return [];
      if (!res.ok) {
        console.warn(`[marketplace-eval] approved-list HTTP ${String(res.status)} — empty`);
        return [];
      }
      const body = (await res.json().catch(() => null)) as unknown;
      const addresses = Array.isArray(body)
        ? body
        : body !== null && typeof body === 'object' && 'addresses' in body
          ? (body as { addresses: unknown[] }).addresses
          : [];
      const out: MarketplaceAddress[] = [];
      for (const e of addresses) {
        if (typeof e === 'string') {
          const p = parseMarketplaceAddress(e);
          if (p !== null) out.push(p);
        } else if (
          e !== null &&
          typeof e === 'object' &&
          'author' in e &&
          'persona' in e &&
          'version' in e
        ) {
          const r = e as Record<string, unknown>;
          out.push({
            scheme: 'atelier',
            author: String(r['author']),
            persona: String(r['persona']),
            version: String(r['version']),
          });
        }
      }
      return out;
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Resolve the persona source. Local-fixtures wins when set; otherwise
  // fall back to the env-fixture / vault-HTTP path.
  let approved: ApprovedPersonaList;
  let fetcher: BundleFetcher;
  let localFixtures: { directory: string } | undefined;
  if (args.localFixtures !== undefined) {
    let source: ReturnType<typeof loadLocalFixtures>;
    try {
      source = loadLocalFixtures({ directory: args.localFixtures });
    } catch (err) {
      console.error(`[marketplace-eval] ${(err as Error).message}`);
      process.exitCode = 2;
      return;
    }
    approved = source.approved;
    fetcher = source.fetcher;
    localFixtures = { directory: args.localFixtures };
    const malformedCount = source.entries.filter((e) => e.error !== undefined).length;
    console.log(
      `[marketplace-eval] local-fixtures: ${String(source.entries.length)} recipe(s) ` +
        `from ${args.localFixtures}` +
        (malformedCount > 0 ? ` (${String(malformedCount)} malformed)` : ''),
    );
  } else {
    if (args.vaultUrl === undefined) {
      console.error(
        '[marketplace-eval] no persona source: pass --vault-url <url> OR --local-fixtures <dir> ' +
          '(or set MARKETPLACE_VAULT_URL / MARKETPLACE_LOCAL_FIXTURES).',
      );
      process.exitCode = 2;
      return;
    }
    approved = loadFixtureApproved() ?? httpApproved(args.vaultUrl);
    fetcher = httpBundleFetcher({ vaultUrl: args.vaultUrl });
  }

  const opts: Parameters<typeof runMarketplaceEval>[0] = {
    approved,
    fetcher,
    fixtures: DEFAULT_FIXTURES,
    top: args.top,
  };
  if (localFixtures !== undefined) opts.localFixtures = localFixtures;
  if (args.strict) opts.strict = true;
  if (args.mode === 'real-llm') {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      console.error(
        '[marketplace-eval] --mode=real-llm requires GEMINI_API_KEY env var; refusing to boot.',
      );
      process.exitCode = 2;
      return;
    }
    opts.mode = 'real-llm';
    opts.geminiApiKey = apiKey;
    opts.llmModel = args.llmModel;
  }

  let report: EvalReport;
  try {
    report = await runMarketplaceEval(opts);
  } catch (err) {
    console.error(`[marketplace-eval] internal error: ${(err as Error).message}`);
    process.exitCode = 2;
    return;
  }

  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  // Concise summary on stdout — friendly for the action log.
  const s = report.summary;
  const costLine =
    s.total_cost_usd !== undefined
      ? ` | cost ${s.total_cost_usd.toFixed(4)} USD (avg ${(s.cost_per_persona_avg_usd ?? 0).toFixed(4)})`
      : '';
  console.log(
    `[marketplace-eval] ${String(s.total)} personas — ` +
      `${String(s.passed)} passed, ${String(s.failed)} failed, ${String(s.skipped)} skipped ` +
      `(${String(s.duration_ms)}ms)${costLine} → ${args.out}`,
  );
  if (s.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(`[marketplace-eval] unhandled: ${String(err)}`);
  process.exitCode = 2;
});
