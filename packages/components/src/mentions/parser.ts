// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 11 / Cnt-3 — string tokenizer for mention / autolink prefixes.
 *
 * Splits a source string into a sequence of `string` chunks (literal
 * text) and `MentionMatch` records. The function is pure and synchronous;
 * it does NOT call any resolver. The downstream `<Mention>` / `<MentionAware>`
 * surfaces own the resolution + rendering.
 *
 * Match rules
 * -----------
 *  - A prefix character (`@`, `#`, `!`, …) followed immediately by an
 *    id of one or more `[A-Za-z0-9_\-./]` characters is one match.
 *  - The prefix MUST be at the start of the string OR preceded by a
 *    whitespace / punctuation character — this is what stops `email@host`
 *    from parsing as `@host`. The character class for "preceded by" is
 *    deliberately broad: anything that's not an id character is OK as a
 *    boundary, so `(@alice)`, `[@alice]`, and `,@alice` all match.
 *  - The id stops at the first non-id character. Linear-shaped ids
 *    (`ENG-123`, `CIR-99`) survive the dash; Slack-style names with dots
 *    (`alice.smith`) survive the dot; Notion-style nested ids
 *    (`team/alice`) survive the slash. Trailing punctuation (`@alice.`,
 *    `#ENG-123!`) is NOT eaten — the dot / bang stays in the literal
 *    chunk so prose punctuation renders correctly.
 *  - An id of length 0 (a bare prefix with no following id char) is
 *    NOT a match — it stays in the literal chunk.
 *
 * Why a hand-rolled tokenizer
 * ---------------------------
 * A single regex for "any of these prefixes" is doable but the
 * "preceded by boundary" rule + "longest matching id" + "stop before
 * trailing punctuation" combination is much clearer as a small state
 * machine. The function is < 60 LOC and has zero allocations per
 * non-match character (we slice the literal once at each match boundary).
 *
 * Boundary character class
 * ------------------------
 * "Inside an id" = `/[A-Za-z0-9_\-./]/`. Everything else is a boundary.
 * This is a pragmatic intersection of:
 *  - GitHub usernames (alphanumeric + `-`)
 *  - Linear issue ids (`ENG-123`, alphanumeric + `-`)
 *  - Slack member ids (`U01ABC`, alphanumeric + `_`)
 *  - Notion-flavoured nested ids (`team/alice`)
 *  - File-path-like ids (`docs/foo.md`)
 *
 * If a host needs a tighter or looser id charset, they should pre-process
 * the string before parsing or post-process the matches; widening this
 * char class further risks eating prose.
 */

import type { MentionMatch } from './resolver.js';

/**
 * Returns true when `ch` is a single character that may appear inside
 * a mention id. The set is fixed across all prefixes — a host that
 * needs a different charset should normalise their text before parsing.
 */
function isIdChar(ch: string): boolean {
  // ASCII alphanumerics, then the four punctuation runners we explicitly
  // allow (`_`, `-`, `.`, `/`). Tested against a single character only.
  if (ch.length !== 1) return false;
  const code = ch.charCodeAt(0);
  if (code >= 48 && code <= 57) return true; // 0-9
  if (code >= 65 && code <= 90) return true; // A-Z
  if (code >= 97 && code <= 122) return true; // a-z
  return ch === '_' || ch === '-' || ch === '.' || ch === '/';
}

/**
 * Returns true when `prevCh` is a valid boundary BEFORE a prefix.
 * `prevCh === undefined` means the prefix is at offset 0, which is
 * always a valid boundary.
 *
 * The boundary rule mirrors `isIdChar`: anything that's NOT an id
 * character qualifies. Most punctuation (`(`, `[`, `,`, `:`) and
 * whitespace are boundaries; alphanumerics and the four runners are not
 * — so `email@host` does not parse as a mention.
 */
function isBoundaryBefore(prevCh: string | undefined): boolean {
  if (prevCh === undefined) return true;
  return !isIdChar(prevCh);
}

/**
 * Trim trailing punctuation (`.`) from a candidate id. The id charset
 * includes `.` so `alice.smith` and `docs/foo.md` round-trip; but a
 * trailing `.` in `Hi @alice.` is prose punctuation, not part of the
 * username. Strip ONLY trailing `.` because:
 *  - `-` and `_` rarely terminate prose
 *  - `/` would change meaning if stripped (`docs/` is not `docs`)
 *
 * Returns the trimmed id and the number of characters trimmed (caller
 * uses the count to leave the trailing `.` in the literal chunk).
 */
function trimTrailingPunct(id: string): { id: string; trimmed: number } {
  let i = id.length;
  while (i > 0 && id[i - 1] === '.') i -= 1;
  return { id: id.slice(0, i), trimmed: id.length - i };
}

/**
 * Split `text` into a sequence of literal-string chunks and parsed
 * `MentionMatch`es. Order is preserved; concatenating the `raw` of every
 * match with the surrounding strings reproduces the input byte-for-byte.
 *
 * `prefixes` is the closed set of prefix characters to recognise. The
 * function does not enforce uniqueness — a duplicated prefix in the
 * caller's list is harmless.
 */
export function parseMentions(
  text: string,
  prefixes: readonly string[],
): readonly (string | MentionMatch)[] {
  if (text.length === 0 || prefixes.length === 0) {
    return text.length === 0 ? [] : [text];
  }
  // Build a constant-time lookup so we don't string-search every char.
  const prefixSet = new Set<string>(prefixes);
  const out: (string | MentionMatch)[] = [];
  let buf = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? '';
    if (prefixSet.has(ch) && isBoundaryBefore(text[i - 1])) {
      // Greedy id read.
      let j = i + 1;
      while (j < text.length && isIdChar(text[j] ?? '')) j += 1;
      const rawId = text.slice(i + 1, j);
      if (rawId.length === 0) {
        // Bare prefix with no id — keep in the literal chunk.
        buf += ch;
        i += 1;
        continue;
      }
      const { id, trimmed } = trimTrailingPunct(rawId);
      if (id.length === 0) {
        // The candidate id was nothing but trailing `.`s — not a match.
        buf += ch;
        i += 1;
        continue;
      }
      // Flush any pending literal before the match.
      if (buf.length > 0) {
        out.push(buf);
        buf = '';
      }
      const raw = text.slice(i, j - trimmed);
      out.push({ prefix: ch, id, raw, offset: i });
      i = j - trimmed;
      continue;
    }
    buf += ch;
    i += 1;
  }
  if (buf.length > 0) out.push(buf);
  return out;
}
