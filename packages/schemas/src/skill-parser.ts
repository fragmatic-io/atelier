// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill markdown parser.
 *
 * A `.skill.md` file is a YAML frontmatter block followed by a free-form
 * markdown body. The YAML is the structured contract validated by
 * `SkillSchema`; the body is the prose the compiler actually reads to
 * understand "how to use the capability well" (ETHOS principle 4).
 *
 * `parseSkillMarkdown` parses the raw file source via `gray-matter`,
 * validates the frontmatter against `SkillSchema`, and returns both the
 * typed skill and the trimmed body.
 *
 * Error contract:
 *   - YAML lex/parse failures throw `SkillParseError` carrying the YAML
 *     engine's `reason`, 1-based `line` / `column`, and a short caret
 *     snippet so developers can fix the file by hand.
 *   - Frontmatter that parses but fails `SkillSchema` throws a `ZodError`
 *     (unchanged — callers across the monorepo already handle that path).
 */

import matter from 'gray-matter';
import { SkillSchema, type Skill } from './skill.js';

export interface ParsedSkill {
  /** Validated frontmatter as a Skill. */
  skill: Skill;
  /** Markdown body after the frontmatter. May be empty. */
  body: string;
}

/**
 * Thrown when the YAML frontmatter cannot be lexed/parsed. Carries the
 * underlying engine's `reason`, the offending position (1-based for
 * developer ergonomics), and a small snippet of source for context.
 *
 * `parseSkillMarkdown` and `atelier lint skill` both surface these fields
 * directly — keep them stable.
 */
export class SkillParseError extends Error {
  /** The parser's short reason, e.g. `unexpected end of the stream...`. */
  public readonly reason: string;
  /** 1-based line of the YAML error. `null` when the engine didn't pinpoint one. */
  public readonly line: number | null;
  /** 1-based column of the YAML error. `null` when the engine didn't pinpoint one. */
  public readonly column: number | null;
  /** The offending source line, when one can be located. Trimmed of the trailing newline. */
  public readonly snippet: string | null;
  /** The original error from gray-matter / js-yaml (for advanced callers). */
  public override readonly cause: unknown;

  constructor(opts: {
    reason: string;
    line: number | null;
    column: number | null;
    snippet: string | null;
    cause: unknown;
  }) {
    const where =
      opts.line !== null && opts.column !== null
        ? ` at line ${String(opts.line)}, column ${String(opts.column)}`
        : '';
    super(`skill frontmatter YAML error: ${opts.reason}${where}`);
    this.name = 'SkillParseError';
    this.reason = opts.reason;
    this.line = opts.line;
    this.column = opts.column;
    this.snippet = opts.snippet;
    this.cause = opts.cause;
  }
}

/**
 * Shape of the YAML engine's exception. We only depend on the bits we need
 * (name, reason, mark) so we can also tolerate non-standard engines.
 */
interface YamlExceptionLike {
  name?: string;
  reason?: string;
  message?: string;
  mark?: {
    line?: number;
    column?: number;
    buffer?: string;
    position?: number;
  };
}

/** Heuristic — gray-matter rethrows js-yaml's `YAMLException`. */
function isYamlException(err: unknown): err is YamlExceptionLike {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: unknown };
  return e.name === 'YAMLException';
}

/** Sentinel char js-yaml appends to the buffer it returns in `mark`. */
const YAML_NUL_SENTINEL = String.fromCharCode(0);

/**
 * Pull a single source line out of the YAML engine's `mark.buffer`.
 * Returns `null` when the buffer is missing or the line is out of range.
 */
function extractSnippet(buffer: string | undefined, zeroBasedLine: number): string | null {
  if (typeof buffer !== 'string') return null;
  const lines = buffer.split('\n');
  if (zeroBasedLine < 0 || zeroBasedLine >= lines.length) return null;
  const line = lines[zeroBasedLine];
  if (line === undefined) return null;
  // Strip the engine's NUL sentinel if it landed on this line.
  return line.split(YAML_NUL_SENTINEL).join('');
}

/**
 * Parse a `.skill.md` source string and validate the frontmatter.
 *
 * @throws SkillParseError when the YAML frontmatter is malformed.
 * @throws ZodError        when the parsed frontmatter fails `SkillSchema`.
 */
export function parseSkillMarkdown(source: string): ParsedSkill {
  let parsed: { data: unknown; content: string };
  try {
    // Pass an explicit (empty) options bag to disable gray-matter's
    // module-level content cache. The cache is populated *before* the
    // YAML engine runs — a thrown YAMLException leaves an empty
    // `{ data: {} }` entry behind, so the next call with the same
    // content silently returns empty data instead of re-throwing. We
    // need every call to re-parse so the YAML error surfaces every
    // time, not just on first encounter.
    parsed = matter(source, {});
  } catch (err) {
    if (isYamlException(err)) {
      const mark = err.mark ?? {};
      const zeroLine = typeof mark.line === 'number' ? mark.line : null;
      const zeroCol = typeof mark.column === 'number' ? mark.column : null;
      throw new SkillParseError({
        reason: err.reason ?? err.message ?? 'YAML parse failed',
        line: zeroLine === null ? null : zeroLine + 1,
        column: zeroCol === null ? null : zeroCol + 1,
        snippet: zeroLine === null ? null : extractSnippet(mark.buffer, zeroLine),
        cause: err,
      });
    }
    // Anything non-YAML (truly unexpected): wrap in SkillParseError too so
    // the CLI has one error type to render. Preserve the original message.
    const message = err instanceof Error ? err.message : String(err);
    throw new SkillParseError({
      reason: message,
      line: null,
      column: null,
      snippet: null,
      cause: err,
    });
  }
  const skill = SkillSchema.parse(parsed.data);
  return { skill, body: parsed.content.trim() };
}
