// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Reporters for the eval runner.
 *
 * Two are shipped by default:
 *  - `ConsoleReporter`: human-readable, glyph-prefixed lines plus a trailing
 *    summary. Uses `kleur` for colour without committing to a heavyweight
 *    formatting library.
 *  - `JsonReporter`: emits one NDJSON record per result and a final
 *    `{"type":"summary",...}` record. Stable shape so CI tooling can parse it.
 *
 * Reporters write to stdout via `process.stdout.write` rather than
 * `console.log` — `console.log` is filtered to "warn"-level by the project's
 * eslint config, and reporters need a clean stream regardless of log level.
 */

import kleur from 'kleur';
import type { EvalResult } from './define.js';
import type { RunSummary } from './run.js';

/** Reporter contract — three lifecycle hooks invoked by the CLI. */
export interface Reporter {
  onStart(plan: { total: number }): void;
  onResult(result: EvalResult): void;
  onSummary(summary: RunSummary): void;
}

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** Glyph + colour for each status, picked to read at-a-glance. */
function glyphFor(status: EvalResult['status']): string {
  switch (status) {
    case 'pass':
      return kleur.green('PASS');
    case 'fail':
      return kleur.red('FAIL');
    case 'skip':
      return kleur.gray('SKIP');
    case 'todo':
      return kleur.yellow('TODO');
    case 'timeout':
      return kleur.magenta('TIME');
    case 'error':
      return kleur.red('ERR ');
  }
}

/** Pretty-print a value for a fail diff. JSON when possible, fallback otherwise. */
function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  try {
    const json = JSON.stringify(value, null, 2);
    if (json !== undefined) return json;
  } catch {
    // fall through
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null)
    return String(value);
  return Object.prototype.toString.call(value);
}

/** Human-friendly streaming reporter. */
export const ConsoleReporter: Reporter = {
  onStart(plan: { total: number }): void {
    write(kleur.dim(`atelier-evals: running ${String(plan.total)} eval(s)`));
  },
  onResult(result: EvalResult): void {
    const tag = glyphFor(result.status);
    const dur = kleur.dim(`(${String(result.duration_ms)}ms)`);
    const kind = kleur.cyan(`[${result.kind}]`);
    write(`${tag} ${kind} ${result.id} ${dur}`);
    if (result.message && result.status !== 'pass') {
      write(`     ${kleur.dim(result.message)}`);
    }
    if (result.status === 'fail' || result.status === 'error') {
      if ('expected' in result) {
        write(`     ${kleur.dim('expected:')} ${formatValue(result.expected)}`);
      }
      if ('actual' in result) {
        write(`     ${kleur.dim('actual:  ')} ${formatValue(result.actual)}`);
      }
    }
  },
  onSummary(summary: RunSummary): void {
    const parts = [
      `${kleur.green(`${String(summary.passed)} passed`)}`,
      `${kleur.red(`${String(summary.failed)} failed`)}`,
      `${kleur.magenta(`${String(summary.timedOut)} timeout`)}`,
      `${kleur.red(`${String(summary.errored)} error`)}`,
      `${kleur.gray(`${String(summary.skipped)} skip`)}`,
      `${kleur.yellow(`${String(summary.todo)} todo`)}`,
    ];
    write('');
    write(`${kleur.bold(`${String(summary.total)} eval(s)`)} — ${parts.join(', ')}`);
    write(kleur.dim(`  total time: ${String(summary.duration_ms)}ms`));
  },
};

/**
 * Machine-readable NDJSON reporter.
 *
 * Emits one `{"type":"start",...}` record, one `{"type":"result",...}` record
 * per eval, and one `{"type":"summary",...}` record at the end. CI tooling
 * can parse each line independently.
 */
export const JsonReporter: Reporter = {
  onStart(plan: { total: number }): void {
    write(JSON.stringify({ type: 'start', total: plan.total }));
  },
  onResult(result: EvalResult): void {
    write(JSON.stringify({ type: 'result', ...result }));
  },
  onSummary(summary: RunSummary): void {
    // Strip the per-result array — it has already been streamed line by line.
    const { results: _results, ...rest } = summary;
    write(JSON.stringify({ type: 'summary', ...rest }));
  },
};
