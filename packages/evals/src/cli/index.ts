#!/usr/bin/env -S node --import=tsx/esm
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier-evals` CLI.
 *
 *   atelier-evals run [--pattern <glob>] [--kind <kind>] [--tag <tag>]
 *                 [--filter <substr>] [--reporter console|json]
 *                 [--concurrency <n>] [--timeout <ms>]
 *
 * Defaults:
 *   --pattern      'evals/**\/*.eval.ts'
 *   --reporter     console
 *   --concurrency  1
 *   --timeout      10000
 *
 * Exit codes:
 *   0 — every eval passed (or was skipped/todo)
 *   1 — any eval failed, errored, or timed out
 *
 * Empty result sets exit 0 by design: a `--filter` that matches nothing is
 * a query, not a failure. The same goes for an empty `evals/` directory.
 *
 * Argv parsing is hand-rolled (no `commander`/`yargs`) to keep the file
 * small and the dependency tree thin.
 */

import { runEvals, type RunOptions, type RunSummary } from '../run.js';
import { ConsoleReporter, JsonReporter, type Reporter } from '../reporter.js';
import type { EvalKind } from '../define.js';

interface ParsedArgs {
  command: string;
  flags: Record<string, string[]>;
}

const VALID_KINDS = new Set<EvalKind>([
  'capability',
  'skill',
  'component',
  'manifest',
  'end-to-end',
]);

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? '';
  const flags: Record<string, string[]> = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a !== undefined && a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      const value = next !== undefined && !next.startsWith('--') ? next : 'true';
      if (next !== undefined && !next.startsWith('--')) i++;
      const bucket = flags[key];
      if (bucket) {
        bucket.push(value);
      } else {
        flags[key] = [value];
      }
    }
  }
  return { command, flags };
}

function first(flags: Record<string, string[]>, key: string): string | undefined {
  const bucket = flags[key];
  return bucket && bucket.length > 0 ? bucket[0] : undefined;
}

function buildOptions(flags: Record<string, string[]>): RunOptions {
  const patterns = flags['pattern'];
  const kindsRaw = flags['kind'] ?? [];
  const tags = flags['tag'];
  const filter = first(flags, 'filter');
  const concurrencyRaw = first(flags, 'concurrency');
  const timeoutRaw = first(flags, 'timeout');

  const kinds: EvalKind[] = [];
  for (const k of kindsRaw) {
    if (!VALID_KINDS.has(k as EvalKind)) {
      throw new Error(`unknown --kind '${k}' (expected: ${[...VALID_KINDS].join(', ')})`);
    }
    kinds.push(k as EvalKind);
  }

  const opts: RunOptions = {};
  if (patterns && patterns.length > 0) opts.patterns = patterns;
  if (kinds.length > 0) opts.kinds = kinds;
  if (tags && tags.length > 0) opts.tags = tags;
  if (filter !== undefined) opts.filter = filter;
  if (concurrencyRaw !== undefined) {
    const n = Number(concurrencyRaw);
    if (!Number.isFinite(n) || n < 1) throw new Error(`--concurrency must be a positive integer`);
    opts.concurrency = Math.floor(n);
  }
  if (timeoutRaw !== undefined) {
    const n = Number(timeoutRaw);
    if (!Number.isFinite(n) || n < 1) throw new Error(`--timeout must be a positive integer (ms)`);
    opts.defaultTimeoutMs = Math.floor(n);
  }
  return opts;
}

function pickReporter(name: string | undefined): Reporter {
  switch (name ?? 'console') {
    case 'console':
      return ConsoleReporter;
    case 'json':
      return JsonReporter;
    default:
      throw new Error(`unknown --reporter '${name ?? ''}' (expected: console, json)`);
  }
}

function exitCodeFor(summary: RunSummary): number {
  return summary.failed === 0 && summary.errored === 0 && summary.timedOut === 0 ? 0 : 1;
}

function usage(): void {
  console.error(
    `usage: atelier-evals run [--pattern <glob>] [--kind <kind>] [--tag <tag>]\n` +
      `                     [--filter <substr>] [--reporter console|json]\n` +
      `                     [--concurrency <n>] [--timeout <ms>]`,
  );
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command !== 'run') {
    usage();
    process.exit(command === '' ? 1 : 1);
  }

  let options: RunOptions;
  let reporter: Reporter;
  try {
    options = buildOptions(flags);
    reporter = pickReporter(first(flags, 'reporter'));
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const summary = await runEvals(process.cwd(), options, {
    onStart: (plan) => reporter.onStart(plan),
    onResult: (result) => reporter.onResult(result),
    onSummary: (s) => reporter.onSummary(s),
  });
  process.exit(exitCodeFor(summary));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
