// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier lint <subcommand> <args>` — front-run validation against a
 * single file. Currently exposes one target:
 *
 *     atelier lint skill <path-to-.skill.md>
 *
 * Runs `parseSkillMarkdown` against the file and prints any error in a
 * developer-actionable format:
 *
 *   - `SkillParseError` (YAML lex/parse): print the engine's reason, the
 *     1-based line and column, and a caret snippet of the offending line.
 *   - `ZodError` (frontmatter shape): print one line per issue, prefixed
 *     by the `path` (`/`-joined) and the message.
 *   - Anything else: print the message verbatim.
 *
 * Exits 0 when the file is clean, 1 otherwise. The `--json` flag dumps
 * the structured result as JSON instead of the human-readable text.
 *
 * The lint command is intentionally per-file. The full-tree check still
 * lives in `pnpm validate` / `atelier-schemas validate-data` — `lint` is
 * the fast, focused tool you reach for after editing a single skill.
 */

/* eslint-disable no-console */

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { parseSkillMarkdown, SkillParseError, ZodError } from '@atelier/schemas';

import { LINT_USAGE, LINT_SKILL_USAGE } from '../usage.js';

export interface LintSkillIssue {
  /** Stable severity. Always `error` today; reserved for future warning level. */
  severity: 'error';
  /** Issue category — `yaml` for parse failures, `schema` for Zod issues. */
  kind: 'yaml' | 'schema' | 'io';
  /** Human-readable single line, ready to print. */
  message: string;
  /** 1-based line in the source file. `null` when not pinned to a line. */
  line: number | null;
  /** 1-based column. `null` when not pinned. */
  column: number | null;
  /** Frontmatter path (Zod issues). `null` for YAML/io. */
  path: string | null;
  /** A short source snippet (YAML errors only). `null` otherwise. */
  snippet: string | null;
}

export interface LintSkillResult {
  /** Absolute path of the linted file. */
  file: string;
  /** Aggregated issue list. Empty when the file is clean. */
  issues: LintSkillIssue[];
  /** Convenience — `issues.length === 0`. */
  ok: boolean;
}

/**
 * Programmatic entry: read + parse a single `.skill.md` file. Always
 * returns; never throws on validation errors. IO failures (file missing,
 * read error) are reported as a single `io` issue.
 */
export async function runLintSkill(
  target: string,
  cwd: string = process.cwd(),
): Promise<LintSkillResult> {
  const abs = isAbsolute(target) ? target : resolve(cwd, target);
  let raw: string;
  try {
    raw = await readFile(abs, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      file: abs,
      ok: false,
      issues: [
        {
          severity: 'error',
          kind: 'io',
          message,
          line: null,
          column: null,
          path: null,
          snippet: null,
        },
      ],
    };
  }

  try {
    parseSkillMarkdown(raw);
    return { file: abs, ok: true, issues: [] };
  } catch (err) {
    if (err instanceof SkillParseError) {
      return {
        file: abs,
        ok: false,
        issues: [
          {
            severity: 'error',
            kind: 'yaml',
            message: err.reason,
            line: err.line,
            column: err.column,
            path: null,
            snippet: err.snippet,
          },
        ],
      };
    }
    if (err instanceof ZodError) {
      return {
        file: abs,
        ok: false,
        issues: err.issues.map((issue) => ({
          severity: 'error' as const,
          kind: 'schema' as const,
          message: issue.message,
          line: null,
          column: null,
          path: issue.path.length > 0 ? `/${issue.path.map(String).join('/')}` : '/',
          snippet: null,
        })),
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      file: abs,
      ok: false,
      issues: [
        {
          severity: 'error',
          kind: 'yaml',
          message,
          line: null,
          column: null,
          path: null,
          snippet: null,
        },
      ],
    };
  }
}

/**
 * Render a `LintSkillResult` as multi-line human-readable text. Pure: tests
 * assert on the exact output. The trailing newline is the caller's job.
 */
export function renderLintSkill(result: LintSkillResult): string {
  if (result.ok) {
    return `OK  ${result.file}`;
  }
  const lines: string[] = [`INVALID  ${result.file}`];
  for (const issue of result.issues) {
    if (issue.kind === 'yaml') {
      const where =
        issue.line !== null && issue.column !== null
          ? `${String(issue.line)}:${String(issue.column)}`
          : '?:?';
      lines.push(`  yaml   ${where}  ${issue.message}`);
      if (issue.snippet !== null && issue.snippet.length > 0) {
        lines.push(`         | ${issue.snippet}`);
        if (issue.column !== null) {
          // 1-based column → caret offset under the `| ` prefix.
          const caretPad = ' '.repeat(Math.max(0, issue.column - 1));
          lines.push(`         | ${caretPad}^`);
        }
      }
    } else if (issue.kind === 'schema') {
      lines.push(`  schema ${issue.path ?? '/'}  ${issue.message}`);
    } else {
      lines.push(`  io     ${issue.message}`);
    }
  }
  return lines.join('\n');
}

/**
 * `atelier lint skill <path>` front-end. Dispatches into `runLintSkill`
 * and prints the rendered result. Returns the exit code (0 / 1).
 */
export async function lintSkillCommand(
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
  cwd: string = process.cwd(),
): Promise<number> {
  if (flags['help'] === 'true') {
    console.log(LINT_SKILL_USAGE);
    return 0;
  }
  const target = positionals[0];
  if (!target) {
    console.error(LINT_SKILL_USAGE);
    return 1;
  }
  const result = await runLintSkill(target, cwd);
  if (flags['json'] === 'true') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const rendered = renderLintSkill(result);
    if (result.ok) {
      console.log(rendered);
    } else {
      console.error(rendered);
    }
  }
  return result.ok ? 0 : 1;
}

/**
 * `atelier lint <target> ...` dispatcher. Today only `skill` is wired up;
 * the structure leaves room for `lint capability`, `lint policy`, etc.
 */
export async function lintCommand(
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
  cwd: string = process.cwd(),
): Promise<number> {
  if (flags['help'] === 'true' && positionals.length === 0) {
    console.log(LINT_USAGE);
    return 0;
  }
  const target = positionals[0];
  if (target === 'skill') {
    return lintSkillCommand(positionals.slice(1), flags, cwd);
  }
  if (!target) {
    console.error(LINT_USAGE);
    return 1;
  }
  console.error(`atelier lint: unknown target '${target}'. Try 'atelier lint skill <path>'.`);
  return 1;
}
