// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Shared types + barrel for the validator runners.
 *
 * Each runner returns a `ValidatorResult` with a stable shape so the
 * top-level reporter doesn't need to know which check ran. Runners can
 * report:
 *
 *   - `pass`   — the check ran and found no issues.
 *   - `fail`   — the check ran and found at least one issue.
 *   - `skip`   — the check was not applicable (no config file, etc.).
 *
 * Skipped checks become failures only when `--strict` is set. Otherwise
 * they are surfaced as `· skipped (<reason>)` in the human report.
 */

/** A single validator's verdict. */
export interface ValidatorResult {
  /** Stable check id used by `--only=` filtering and `--json` output. */
  id:
    | 'typecheck'
    | 'lint'
    | 'test'
    | 'capabilities'
    | 'skills'
    | 'policies'
    | 'brandKit'
    | 'recipes'
    | 'componentsRegistry';
  /** Human-readable label printed in the report. */
  label: string;
  /** Outcome. */
  status: 'pass' | 'fail' | 'skip';
  /** Path scope hinted in the report (`./src/**`, `./capabilities/`, ...). */
  scope: string;
  /** Files / tests counted by this check. `null` when not meaningful. */
  fileCount: number | null;
  /** Error count surfaced by this check. `null` when not meaningful. */
  errorCount: number | null;
  /** Reason string — for `skip` rows AND human-friendly `fail` summaries. */
  reason: string | null;
  /** Per-issue details (file + line + reason). Empty for `pass`/`skip`. */
  issues: ValidatorIssue[];
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

/** Granular per-file failure attached to a `ValidatorResult.issues[]`. */
export interface ValidatorIssue {
  /** Absolute path of the offending file. */
  file: string;
  /** 1-based line, when known. `null` for tool-level errors. */
  line: number | null;
  /** Human-readable explanation. */
  message: string;
}

export { runTypecheck } from './typescript.js';
export { runEslint } from './eslint.js';
export { runVitest } from './vitest.js';
export {
  runCapabilitiesValidator,
  runSkillsValidator,
  runPoliciesValidator,
  runBrandKitValidator,
  runRecipesValidator,
  runComponentRegistryValidator,
} from './schemas.js';
