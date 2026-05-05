// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier validate` — real validator that runs inside the consumer's
 * project regardless of layout.
 *
 * Sprint 1.2 reimplementation. Replaces the previous `pnpm validate`
 * shell-out, which only worked inside the Atelier monorepo. The current
 * implementation:
 *
 *   1. Detects the consumer's stack (TypeScript, ESLint, Vitest, package
 *      manager) via `detectStack(root)`.
 *   2. Runs the available checks in a fixed order: typecheck, lint, test,
 *      then Atelier-specific schema validators (capabilities, skills,
 *      policies, recipes, brand-kit, components/registry.json).
 *   3. Reports a tabular summary with per-check status and counts.
 *
 * Skipped checks (no eslint config, etc.) are labelled `· skipped (<reason>)`
 * rather than failing. The `--strict` flag flips that — used in CI to
 * guarantee every advertised check actually ran.
 *
 * Exit codes:
 *   - 0 — all detected checks passed.
 *   - 1 — at least one check failed (or skipped under --strict).
 *   - 2 — configuration error (no package.json, etc.).
 *
 * Flags:
 *   - `--strict`       — fail on skipped checks.
 *   - `--json`         — machine-readable output. Stable shape:
 *                        { ok, results: ValidatorResult[], strict }.
 *   - `--only=<set>`   — subset run. Comma-separated list:
 *                        typecheck, lint, test, schemas. Single token
 *                        `schemas` expands to all six Atelier validators.
 */

/* eslint-disable no-console */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { detectStack } from '../lib/detect-stack.js';
import {
  runCapabilitiesValidator,
  runComponentRegistryValidator,
  runBrandKitValidator,
  runEslint,
  runPoliciesValidator,
  runRecipesValidator,
  runSkillsValidator,
  runTypecheck,
  runVitest,
  type ValidatorResult,
} from '../lib/run-validators/index.js';
import { VALIDATE_USAGE } from '../usage.js';

export interface ValidateOptions {
  /** Project root. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Treat skipped checks as failures. */
  strict?: boolean;
  /** Emit JSON instead of human-readable text. */
  json?: boolean;
  /** Subset of checks to run. `null` = run everything detected. */
  only?: ReadonlySet<string> | null;
}

/** Stable shape returned to programmatic callers and `--json`. */
export interface ValidateRunResult {
  ok: boolean;
  strict: boolean;
  results: ValidatorResult[];
}

/** Stable check ids in display order. Mirrors ValidatorResult['id']. */
type CheckId =
  | 'typecheck'
  | 'lint'
  | 'test'
  | 'capabilities'
  | 'skills'
  | 'policies'
  | 'brandKit'
  | 'recipes'
  | 'componentsRegistry';

const SCHEMA_IDS: ReadonlyArray<CheckId> = [
  'capabilities',
  'skills',
  'policies',
  'brandKit',
  'recipes',
  'componentsRegistry',
];

/**
 * Programmatic entry. Pure-ish: writes nothing to stdout, returns a
 * structured result. Tests assert against this shape; the CLI front-end
 * formats it for human output.
 */
export async function runValidate(options: ValidateOptions = {}): Promise<ValidateRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const strict = options.strict ?? false;
  const only = options.only ?? null;

  const stack = detectStack(cwd);

  // Configuration error: no package.json. Surface a single tool-level
  // failure so the CLI front-end can emit exit code 2.
  if (!stack.hasPackageJson) {
    return {
      ok: false,
      strict,
      results: [
        {
          id: 'typecheck',
          label: 'config',
          status: 'fail',
          scope: cwd,
          fileCount: null,
          errorCount: 1,
          reason: 'no package.json found',
          issues: [
            {
              file: cwd,
              line: null,
              message: `No package.json at ${cwd}. Run 'atelier validate' from your project root.`,
            },
          ],
          durationMs: 0,
        },
      ],
    };
  }

  const enabled = (id: CheckId): boolean => {
    if (only === null) return true;
    if (only.has(id)) return true;
    if (only.has('schemas') && SCHEMA_IDS.includes(id)) return true;
    return false;
  };

  const results: ValidatorResult[] = [];
  if (enabled('typecheck')) results.push(await runTypecheck(stack));
  if (enabled('lint')) results.push(await runEslint(stack));
  if (enabled('test')) results.push(await runVitest(stack));
  if (enabled('capabilities')) results.push(await runCapabilitiesValidator(stack));
  if (enabled('skills')) results.push(await runSkillsValidator(stack));
  if (enabled('policies')) results.push(await runPoliciesValidator(stack));
  if (enabled('brandKit')) results.push(await runBrandKitValidator(stack));
  if (enabled('recipes')) results.push(await runRecipesValidator(stack));
  if (enabled('componentsRegistry')) results.push(await runComponentRegistryValidator(stack));

  const failures = results.filter((r) => r.status === 'fail').length;
  const skips = results.filter((r) => r.status === 'skip').length;
  const ok = failures === 0 && (!strict || skips === 0);

  return { ok, strict, results };
}

/** Render a `ValidateRunResult` as the human table. Pure — tests assert text. */
export function renderValidateText(result: ValidateRunResult): string {
  const lines: string[] = [];
  lines.push('atelier validate');
  lines.push('────────────────────────────────────────');
  for (const r of result.results) {
    lines.push(formatRow(r, result.strict));
  }
  lines.push('────────────────────────────────────────');
  const passed = result.results.filter((r) => r.status === 'pass').length;
  const failed = result.results.filter((r) => r.status === 'fail').length;
  const skipped = result.results.filter((r) => r.status === 'skip').length;
  const total = result.results.length;
  if (result.ok) {
    lines.push(`PASS  All checks passed (${passed}/${total})`);
  } else if (failed > 0) {
    lines.push(`FAIL  ${failed} check(s) failed, ${passed} passed, ${skipped} skipped`);
  } else {
    // strict + skips present
    lines.push(`FAIL  ${skipped} check(s) skipped under --strict`);
  }
  // Detail rows for failures, listed below the summary.
  for (const r of result.results) {
    if (r.status !== 'fail') continue;
    if (r.issues.length === 0) continue;
    lines.push('');
    lines.push(`  ${r.label} failures:`);
    for (const issue of r.issues.slice(0, 20)) {
      const where = issue.line !== null ? `${issue.file}:${String(issue.line)}` : issue.file;
      lines.push(`    ${where} — ${issue.message}`);
    }
    if (r.issues.length > 20) {
      lines.push(`    ... +${r.issues.length - 20} more`);
    }
  }
  return lines.join('\n');
}

function formatRow(r: ValidatorResult, strict: boolean): string {
  const symbol =
    r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : strict ? 'FAIL' : 'SKIP';
  const label = padRight(r.label, 14);
  const scope = padRight(r.scope, 28);
  let summary: string;
  if (r.status === 'skip') {
    summary = `skipped (${r.reason ?? 'unknown'})`;
  } else if (r.status === 'fail') {
    summary = r.reason ?? 'failed';
  } else {
    const fc = r.fileCount;
    const ec = r.errorCount;
    if (fc !== null && ec !== null) {
      summary = `${String(fc)} file(s), ${String(ec)} error(s)`;
    } else if (fc !== null) {
      summary = `${String(fc)} file(s)`;
    } else {
      summary = 'ok';
    }
  }
  return `${symbol}  ${label}  ${scope}  ${summary}`;
}

function padRight(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

/** Parse the `--only=` flag value into a Set. */
function parseOnly(value: string | undefined): ReadonlySet<string> | null {
  if (!value || value === 'true') return null;
  return new Set(
    value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/**
 * CLI front-end. Returns the shell exit code:
 *   - 0 on success.
 *   - 1 on validation failure.
 *   - 2 on configuration error (no package.json).
 */
export async function validateCommand(
  _positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
  cwd: string = process.cwd(),
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(VALIDATE_USAGE);
    return 0;
  }
  const strict = flags['strict'] === 'true';
  const json = flags['json'] === 'true';
  const only = parseOnly(flags['only']);

  const result = await runValidate({ cwd, strict, json, only });

  // Configuration error fast path: no package.json — exit 2.
  if (!existsSync(join(cwd, 'package.json'))) {
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`atelier validate: no package.json at ${cwd}. Run from your project root.`);
    }
    return 2;
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const text = renderValidateText(result);
    if (result.ok) {
      console.log(text);
    } else {
      console.error(text);
    }
  }
  return result.ok ? 0 : 1;
}
