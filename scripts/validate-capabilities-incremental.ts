// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `pnpm capabilities:validate-changed` — Wave 10 / S-5 incremental validator.
 *
 * Reads `git diff --name-only <base>...HEAD` (or `--cached` for staged) and
 * validates ONLY the capability JSON files in the diff. PR builds use this
 * for the per-commit gate; the full `pnpm validate:data` walk runs on
 * pushes to `main`.
 *
 * Why incremental validation:
 *  - Once the catalog crosses ~200 capabilities, the full walk's startup cost
 *    (Ajv compile + fs.walk + JSON.parse * N) dominates a CI run that touched
 *    one file. The diff-driven validator stays sub-second on the common case
 *    where a PR adds or edits a handful of capabilities.
 *  - The id resolution rule still holds: every capability file's `id` is
 *    canonical; the path under `capabilities/` is purely organisational.
 *    Hierarchical paths (`capabilities/github/issue/list.json`) are walked
 *    the same way as flat ones (`capabilities/github/repo.list.json`).
 *  - Generated `_index.json` files are silently skipped — they're emitted by
 *    `pnpm capabilities:index` and validated against `CapabilityIndexSchema`
 *    by the index generator's own `--check` mode (run separately in CI).
 *
 * Usage:
 *   tsx scripts/validate-capabilities-incremental.ts
 *     # Diff against `origin/main` (default base; CI sets `CIR_DIFF_BASE`).
 *
 *   tsx scripts/validate-capabilities-incremental.ts --base main
 *     # Override the comparison base.
 *
 *   tsx scripts/validate-capabilities-incremental.ts --cached
 *     # Validate the staged set instead of HEAD vs base. Wired into the
 *     # husky pre-commit so authors get fast feedback before the commit.
 *
 *   tsx scripts/validate-capabilities-incremental.ts --files capabilities/foo.json …
 *     # Skip git entirely; validate the explicit list. Used by the test
 *     # harness so it doesn't have to spawn `git`.
 *
 *   tsx scripts/validate-capabilities-incremental.ts --strict
 *     # Mirror `atelier-schemas validate-data --strict`: fail on capabilities
 *     # whose `_review.needs` array is non-empty (unreviewed importer drafts).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CapabilitySchema } from '@atelier/schemas';

const ROOT = resolve(import.meta.dirname, '..');

export interface IncrementalArgs {
  /** Comparison base for `git diff` (default `origin/main`). */
  base: string;
  /** When true, use `git diff --cached` (staged set). */
  cached: boolean;
  /** Explicit file list — overrides `git diff` entirely. */
  files: readonly string[] | null;
  /** Strict mode (fails on outstanding `_review.needs`). */
  strict: boolean;
}

export function parseArgs(argv: readonly string[]): IncrementalArgs {
  const args: IncrementalArgs = {
    base: process.env['CIR_DIFF_BASE'] ?? 'origin/main',
    cached: false,
    files: null,
    strict: false,
  };
  const explicit: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cached') {
      args.cached = true;
    } else if (a === '--strict') {
      args.strict = true;
    } else if (a === '--base') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('--base requires a value');
      args.base = next;
      i++;
    } else if (a === '--files') {
      // Consume the rest of argv as explicit file paths.
      for (let j = i + 1; j < argv.length; j++) {
        const v = argv[j];
        if (v !== undefined) explicit.push(v);
      }
      args.files = explicit;
      break;
    }
  }
  return args;
}

/**
 * Spawn `git` to enumerate the diff. Returns paths RELATIVE to `cwd`.
 *
 * Three diff modes:
 *  - `cached`: `git diff --cached --name-only --diff-filter=ACMR`
 *  - `from base`: `git diff --name-only --diff-filter=ACMR <base>...HEAD`
 *
 * `--diff-filter=ACMR` keeps Added / Copied / Modified / Renamed entries —
 * deletions don't need validation. Renames are reported by their NEW path
 * (git's default for `--name-only`), which is what we want.
 */
export function runGitDiff(args: { base: string; cached: boolean; cwd: string }): string[] {
  const filter = '--diff-filter=ACMR';
  const argv = args.cached
    ? ['diff', '--cached', '--name-only', filter]
    : ['diff', '--name-only', filter, `${args.base}...HEAD`];
  const result = spawnSync('git', argv, { cwd: args.cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      `git ${argv.join(' ')}: exit ${result.status ?? '?'}${stderr ? ` — ${stderr}` : ''}`,
    );
  }
  return result.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Filter a list of changed files (relative to repo root) to the subset that
 * lives under `capabilities/` and is a capability JSON (not a generated
 * `_index.json`). Exported so tests can exercise the filter without a
 * spawned git process.
 */
export function filterCapabilityFiles(changed: readonly string[]): string[] {
  return changed.filter(
    (p) =>
      p.startsWith('capabilities/') &&
      p.endsWith('.json') &&
      !p.endsWith('/_index.json') &&
      p !== 'capabilities/_index.json',
  );
}

export interface ValidationFailure {
  /** Path RELATIVE to repo root. */
  path: string;
  /** Human-readable error string. */
  message: string;
}

export interface ValidationReport {
  /** Files actually validated (post-filter). */
  files: readonly string[];
  /** Failures, if any. */
  failures: readonly ValidationFailure[];
}

function unreviewedNeeds(data: unknown): readonly string[] | null {
  if (typeof data !== 'object' || data === null) return null;
  const review = (data as { _review?: unknown })._review;
  if (typeof review !== 'object' || review === null) return null;
  const needs = (review as { needs?: unknown }).needs;
  if (!Array.isArray(needs) || needs.length === 0) return null;
  return needs.filter((n): n is string => typeof n === 'string');
}

/**
 * Validate the given capability paths (relative to `cwd`) against
 * `CapabilitySchema`. The path-id consistency check (Wave 10 / S-5) refuses
 * a file whose canonical id can't reasonably be reconstructed from the
 * filesystem path — the id field is canonical, but a glaring mismatch
 * (e.g. `github/foo.json` declaring `id: "stripe.bar"`) is almost always
 * an authoring mistake and the validator surfaces it as a hard fail.
 */
export async function validateFiles(
  paths: readonly string[],
  options: { cwd: string; strict: boolean },
): Promise<ValidationReport> {
  const failures: ValidationFailure[] = [];
  const validated: string[] = [];
  for (const rel of paths) {
    const abs = isAbsolute(rel) ? rel : resolve(options.cwd, rel);
    const display = isAbsolute(rel) ? relative(options.cwd, abs) : rel;
    if (!existsSync(abs)) {
      // File deleted between diff-time and validate-time — skip silently.
      continue;
    }
    const raw = await readFile(abs, 'utf8');
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      failures.push({ path: display, message: `invalid JSON — ${(err as Error).message}` });
      continue;
    }
    const result = CapabilitySchema.safeParse(data);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '/'}: ${i.message}`)
        .join('; ');
      failures.push({ path: display, message: `invalid capability — ${issues}` });
      continue;
    }
    if (options.strict) {
      const outstanding = unreviewedNeeds(data);
      if (outstanding) {
        failures.push({
          path: display,
          message: `${outstanding.length} review item(s) outstanding (${outstanding.join(', ')})`,
        });
        continue;
      }
    }
    validated.push(display);
  }
  return { files: validated, failures };
}

/**
 * Assemble the changed-file list from CLI args (either via `git diff` or
 * the `--files` override) and validate them. Returns a report; the CLI
 * shell turns it into stderr + exit code.
 */
export async function runIncremental(
  args: IncrementalArgs,
  cwd: string = ROOT,
): Promise<ValidationReport> {
  let changed: string[];
  if (args.files !== null) {
    // Normalize explicit paths to repo-relative for filtering.
    changed = args.files.map((p) => (isAbsolute(p) ? relative(cwd, p) : p));
  } else {
    changed = runGitDiff({ base: args.base, cached: args.cached, cwd });
  }
  const filtered = filterCapabilityFiles(changed);
  return validateFiles(filtered, { cwd, strict: args.strict });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await runIncremental(args);
  if (report.files.length === 0 && report.failures.length === 0) {
    console.warn('capabilities:validate-changed: no capability files in diff');
    return;
  }
  if (report.failures.length > 0) {
    for (const f of report.failures) {
      console.error(`INVALID  ${f.path}`);
      console.error(`         ${f.message}`);
    }
    console.error(
      `capabilities:validate-changed: ${report.files.length} ok, ${report.failures.length} failure(s)`,
    );
    process.exit(1);
  }
  console.warn(`capabilities:validate-changed: ${report.files.length} file(s) ok`);
}

const invokedAsScript = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main().catch((err: unknown) => {
    console.error('capabilities:validate-changed: unexpected error');
    console.error(err);
    process.exit(1);
  });
}
