// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * DiffView — line-by-line text diff renderer.
 *
 * Wave 11 / Cnt-2 extends the original primitive (a single flat row list) with
 * the GitHub / Linear-style hunk model: each hunk owns its own contiguous run
 * of lines plus a `(oldStart, newStart, oldLines, newLines)` header that
 * mirrors the unified-diff `@@ -a,b +c,d @@` syntax. This shape is what every
 * server-side diff library returns (jsdiff / parse-diff / git itself) so the
 * component speaks "diff dialect" without us inventing a new schema.
 *
 * The component DOES NOT compute a diff — the caller supplies pre-computed
 * hunks. Three render modes cover the full surface area:
 *
 *   - `unified` — GitHub-style stacked rows (default for the new shape).
 *   - `split`   — Two-column side-by-side; deletions land on the left,
 *                 additions on the right. Context spans both columns.
 *   - `minimal` — Today's pre-Cnt-2 behaviour: a flat row list with no hunk
 *                 header / expand-to-context affordance. Default for hosts
 *                 that pass the legacy `{kind, line, …}` row shape so the
 *                 ticket retries Wave 7's row-only DiffView contract.
 *
 * ## Per-hunk syntax highlighting (Cnt-1 reuse)
 *
 * When `language` is set, each hunk's content lines are joined into a single
 * string and tokenised by the lazy Shiki bridge from Cnt-1. The highlighted
 * HTML is split back on `\n` so each diff row carries its own
 * `<span data-cir-part="diff-line">` with the per-line tokens. This means we
 * pay one Shiki call per hunk (not per line), which is what Linear / GitHub
 * do — they tokenise the full hunk once and slice on render.
 *
 * Shiki is an OPTIONAL peer dep. When the import rejects (host hasn't
 * installed it) the hook flips to `'error'` and we render the raw text. No
 * crash — same fallback as `<CodeView>`.
 *
 * ## Expand-to-context
 *
 * `contextHidden` lets a hunk advertise "N additional context lines exist
 * before / between this hunk and the next". When set AND `onExpandContext`
 * is provided, the component renders an "Expand N lines" button between
 * hunks. Clicking it invokes `onExpandContext(hunkIndex)` — the host is then
 * responsible for fetching and re-rendering with a larger hunk. This is the
 * same contract GitHub uses (their up/down chevrons in the diff gutter).
 *
 * ## Per-line decoration
 *
 * - `data-diff="add" | "del" | "context"` lands on every diff row so host
 *   CSS can paint backgrounds (green / red / neutral). The legacy `'remove'`
 *   kind is normalised to `'del'` at render time.
 * - `linkLines` adds `id="L<n>"` keyed off the new line number (or old line
 *   number for pure-delete rows). Mirrors `<CodeView>` Cnt-1's contract.
 * - `highlightLines` is the same set as Cnt-1: 1-indexed new-side line
 *   numbers that flip `data-highlight="true"` on the matching row.
 *
 * ## Back-compat
 *
 * Pre-Cnt-2 callers passed a flat row list (`{ kind, line, oldNumber,
 * newNumber }`) under the same `hunks` prop. That shape still works — the
 * component detects "row vs hunk" by checking for the new-shape fields
 * (`lines` array + `oldStart`). When the legacy shape is detected the
 * variant defaults to `'minimal'` and we render today's behaviour
 * unchanged. The legacy `'remove'` kind is accepted alongside the spec's
 * `'del'`.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { highlight, DEFAULT_SHIKI_THEME, type ShikiThemePair } from '../code/shiki.js';
import { cn, diffViewVariantClass, type DiffViewVariant } from './_variants.js';

// ---------------------------------------------------------------------------
// Types — Cnt-2 canonical shape
// ---------------------------------------------------------------------------

/**
 * Diff line kind. `'del'` is the spec-canonical name for a deletion; the
 * legacy `'remove'` token is accepted for back-compat and normalised at
 * render time. New code should write `'del'`.
 */
export type DiffKind = 'add' | 'del' | 'context';

/** Same as {@link DiffKind} plus the legacy `'remove'` alias. */
export type DiffKindInput = DiffKind | 'remove';

/** A single line in a hunk (Cnt-2). */
export interface DiffLine {
  kind: DiffKind;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/** A unified-diff hunk header + its contiguous run of lines (Cnt-2). */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: readonly DiffLine[];
  /**
   * Number of context lines hidden between this hunk and the next. When
   * non-zero AND an `onExpandContext` callback is provided, the component
   * renders an "Expand N lines" affordance between hunks.
   */
  contextHidden?: number;
}

// ---------------------------------------------------------------------------
// Legacy row shape (pre-Cnt-2). Retained ONLY for back-compat with the small
// number of callers that pass a flat row list.
// ---------------------------------------------------------------------------

/**
 * @deprecated Use {@link DiffHunk} + {@link DiffLine}. Kept so the original
 * Wave 7 callers that pass a flat row list keep rendering.
 */
export interface LegacyDiffRow {
  kind: DiffKindInput;
  line: string;
  oldNumber?: number;
  newNumber?: number;
}

/** Discriminator: is this a hunk (new shape) or a flat row (legacy)? */
function isHunk(value: DiffHunk | LegacyDiffRow): value is DiffHunk {
  return 'lines' in value && Array.isArray(value.lines);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DiffViewProps {
  /**
   * Hunks (Cnt-2) OR a flat row list (legacy). The component sniffs the
   * shape and routes to the right renderer.
   */
  hunks?: readonly (DiffHunk | LegacyDiffRow)[];
  /**
   * Pre-Cnt-2 escape hatch — render a single full-text block as a no-marker
   * pre. Useful for "raw patch" surfaces where the host already has the diff
   * as one string blob. Mutually exclusive with `hunks` (when both are set
   * `hunks` wins).
   */
  code?: string;
  /** Shiki language id for per-hunk syntax highlighting. */
  language?: string;
  /** Shiki theme pair (defaults to `github-light` / `github-dark`). */
  theme?: ShikiThemePair;
  /** Render mode (see file-level doc-comment). */
  variant?: DiffViewVariant;
  /**
   * Invoked when the user clicks "Expand N lines" between hunks. The host
   * is responsible for fetching the additional context and re-rendering.
   */
  onExpandContext?: (hunkIndex: number) => void | Promise<void>;
  /** When true, every row gets `id="L<n>"` (keyed off new-side line). */
  linkLines?: boolean;
  /** New-side line numbers that flip `data-highlight="true"` on the row. */
  highlightLines?: readonly number[];
  /** Class string forwarded to the outer wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise `'remove'` (legacy) → `'del'` (Cnt-2 canonical). */
function normalizeKind(k: DiffKindInput): DiffKind {
  return k === 'remove' ? 'del' : k;
}

/** Marker glyph for the gutter column. */
const PREFIX: Readonly<Record<DiffKind, string>> = Object.freeze({
  add: '+',
  del: '-',
  context: ' ',
});

/**
 * Per-hunk Shiki tokenisation. We tokenise the WHOLE hunk's content as one
 * string so multi-line constructs (templates, JSX tags) keep their grammar
 * state, then split the highlighted HTML back on `\n`.
 *
 * The split heuristic: Shiki emits one `<span class="line">…</span>` per
 * source line inside the outer `<pre><code>`. We grab the inner of each
 * line span. If the regex doesn't match (different Shiki version, mocked
 * stub, etc.) we fall back to plain text per line — safe by construction.
 */
function splitHighlightedLines(html: string, lineCount: number): string[] {
  const out: string[] = [];
  // Shiki ≥ 1.x emits `<span class="line">…</span>` per line.
  const re = /<span class="line">([\s\S]*?)<\/span>(?:\n|$)/g;
  let m: RegExpExecArray | null = re.exec(html);
  while (m !== null) {
    out.push(m[1] ?? '');
    m = re.exec(html);
  }
  // If we didn't match the expected shape, return empty so the caller falls
  // back to plain text. Don't return a partial / mis-aligned slice.
  if (out.length !== lineCount) return [];
  return out;
}

interface HunkHighlight {
  /** Per-line highlighted HTML for the light theme (one entry per line). */
  light: string[];
  /** Per-line highlighted HTML for the dark theme. */
  dark: string[];
}

/**
 * Lazy per-hunk highlight hook. Tokenises every hunk's content via Shiki
 * once `language` is set; resolves to a `HunkHighlight[]` with one entry per
 * hunk (parallel to the input `hunks` array). Falls back to an empty array
 * on any error — the caller renders plain text.
 */
function useHunkHighlights(
  hunks: readonly DiffHunk[],
  language: string | undefined,
  theme: ShikiThemePair,
): HunkHighlight[] {
  const [results, setResults] = useState<HunkHighlight[]>([]);

  // Stable key for the effect: language + theme + per-hunk content joined.
  // Joining the content is cheap relative to the Shiki tokenise call and
  // means we only re-run when the source actually changed.
  const key = useMemo(() => {
    if (!language) return '';
    const parts: string[] = [language, theme.light, theme.dark];
    for (const h of hunks) {
      for (const l of h.lines) parts.push(l.content);
      parts.push('|');
    }
    return parts.join(' ');
  }, [hunks, language, theme.light, theme.dark]);

  useEffect(() => {
    if (!language) {
      setResults([]);
      return;
    }
    const ac = new AbortController();
    Promise.all(
      hunks.map(async (h) => {
        const text = h.lines.map((l) => l.content).join('\n');
        const r = await highlight(text, language, theme);
        return {
          light: splitHighlightedLines(r.light, h.lines.length),
          dark: splitHighlightedLines(r.dark, h.lines.length),
        };
      }),
    ).then(
      (rs) => {
        if (ac.signal.aborted) return;
        setResults(rs);
      },
      () => {
        if (ac.signal.aborted) return;
        setResults([]);
      },
    );
    return (): void => {
      ac.abort();
    };
    // `key` captures every meaningful change; hunks / theme are folded
    // into `key` so referencing them as deps would over-fire the effect.
  }, [key]);

  return results;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

interface RowProps {
  line: DiffLine;
  highlightedHtml?: { light: string; dark: string } | undefined;
  linkLines: boolean;
  isHighlighted: boolean;
  rowId?: string | undefined;
}

/** A single unified-diff row (used by `unified` + `minimal` variants). */
function UnifiedRow({
  line,
  highlightedHtml,
  linkLines,
  isHighlighted,
  rowId,
}: RowProps): ReactNode {
  const id = linkLines && rowId !== undefined ? rowId : undefined;
  return (
    <div
      data-cir-part="diff-row"
      data-kind={line.kind}
      data-diff={line.kind}
      data-highlight={isHighlighted ? 'true' : undefined}
      id={id}
      style={{ display: 'flex', whiteSpace: 'pre' }}
    >
      <span
        data-cir-part="diff-old-num"
        aria-hidden="true"
        style={{ display: 'inline-block', width: '4ch', textAlign: 'right', opacity: 0.6 }}
      >
        {line.oldLineNumber !== undefined ? String(line.oldLineNumber) : ''}
      </span>
      <span
        data-cir-part="diff-new-num"
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '4ch',
          textAlign: 'right',
          padding: '0 6px',
          opacity: 0.6,
        }}
      >
        {line.newLineNumber !== undefined ? String(line.newLineNumber) : ''}
      </span>
      <span data-cir-part="diff-marker" aria-hidden="true">
        {PREFIX[line.kind]}
      </span>
      {highlightedHtml ? (
        <>
          <span
            data-cir-part="diff-line"
            data-theme="light"
            // Shiki HTML is entity-escaped by construction — safe.
            dangerouslySetInnerHTML={{ __html: highlightedHtml.light }}
          />
          <span
            data-cir-part="diff-line"
            data-theme="dark"
            dangerouslySetInnerHTML={{ __html: highlightedHtml.dark }}
          />
        </>
      ) : (
        <span data-cir-part="diff-line">{line.content}</span>
      )}
    </div>
  );
}

interface SplitRowProps {
  oldLine: DiffLine | null;
  newLine: DiffLine | null;
  oldHtml?: { light: string; dark: string } | undefined;
  newHtml?: { light: string; dark: string } | undefined;
  linkLines: boolean;
  highlightSet: ReadonlySet<number>;
}

/** A side-by-side row: deletion on left, addition on right. */
function SplitRow({
  oldLine,
  newLine,
  oldHtml,
  newHtml,
  linkLines,
  highlightSet,
}: SplitRowProps): ReactNode {
  const newLineNumber = newLine?.newLineNumber;
  const isHighlighted = newLineNumber !== undefined && highlightSet.has(newLineNumber);
  const rowId =
    linkLines && newLineNumber !== undefined
      ? `L${String(newLineNumber)}`
      : linkLines && oldLine?.oldLineNumber !== undefined
        ? `L${String(oldLine.oldLineNumber)}`
        : undefined;
  return (
    <div
      data-cir-part="diff-split-row"
      data-highlight={isHighlighted ? 'true' : undefined}
      id={rowId}
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', whiteSpace: 'pre' }}
    >
      <SplitCell side="old" line={oldLine} html={oldHtml} />
      <SplitCell side="new" line={newLine} html={newHtml} />
    </div>
  );
}

interface SplitCellProps {
  side: 'old' | 'new';
  line: DiffLine | null;
  html?: { light: string; dark: string } | undefined;
}

function SplitCell({ side, line, html }: SplitCellProps): ReactNode {
  if (line === null) {
    return (
      <div
        data-cir-part="diff-row"
        data-side={side}
        data-kind="empty"
        data-diff="context"
        style={{ opacity: 0.4 }}
      />
    );
  }
  const num = side === 'old' ? line.oldLineNumber : line.newLineNumber;
  return (
    <div
      data-cir-part="diff-row"
      data-side={side}
      data-kind={line.kind}
      data-diff={line.kind}
      style={{ display: 'flex' }}
    >
      <span
        data-cir-part={side === 'old' ? 'diff-old-num' : 'diff-new-num'}
        aria-hidden="true"
        style={{ display: 'inline-block', width: '4ch', textAlign: 'right', opacity: 0.6 }}
      >
        {num !== undefined ? String(num) : ''}
      </span>
      <span data-cir-part="diff-marker" aria-hidden="true" style={{ padding: '0 6px' }}>
        {PREFIX[line.kind]}
      </span>
      {html ? (
        <>
          <span
            data-cir-part="diff-line"
            data-theme="light"
            dangerouslySetInnerHTML={{ __html: html.light }}
          />
          <span
            data-cir-part="diff-line"
            data-theme="dark"
            dangerouslySetInnerHTML={{ __html: html.dark }}
          />
        </>
      ) : (
        <span data-cir-part="diff-line">{line.content}</span>
      )}
    </div>
  );
}

/**
 * Pair up an old-side line and a new-side line per visual row in split mode.
 * Strategy: walk the hunk; for each contiguous run of `del` then `add`,
 * align by index so deletions land on the left and additions on the right.
 * Context lines occupy both sides on the same row. This is the algorithm
 * GitHub's own diff renderer uses — simple, surprisingly effective.
 */
function pairSplitRows(lines: readonly DiffLine[]): Array<{
  old: { line: DiffLine; index: number } | null;
  new: { line: DiffLine; index: number } | null;
}> {
  const out: Array<{
    old: { line: DiffLine; index: number } | null;
    new: { line: DiffLine; index: number } | null;
  }> = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln) {
      i += 1;
      continue;
    }
    if (ln.kind === 'context') {
      out.push({ old: { line: ln, index: i }, new: { line: ln, index: i } });
      i += 1;
      continue;
    }
    // Collect a contiguous run of dels followed by a run of adds.
    const dels: Array<{ line: DiffLine; index: number }> = [];
    while (i < lines.length && lines[i]?.kind === 'del') {
      const cur = lines[i];
      if (cur) dels.push({ line: cur, index: i });
      i += 1;
    }
    const adds: Array<{ line: DiffLine; index: number }> = [];
    while (i < lines.length && lines[i]?.kind === 'add') {
      const cur = lines[i];
      if (cur) adds.push({ line: cur, index: i });
      i += 1;
    }
    const max = Math.max(dels.length, adds.length);
    for (let j = 0; j < max; j += 1) {
      out.push({ old: dels[j] ?? null, new: adds[j] ?? null });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiffView(props: DiffViewProps): ReactNode {
  const {
    hunks,
    code,
    language,
    theme = DEFAULT_SHIKI_THEME,
    variant: variantProp,
    onExpandContext,
    linkLines = false,
    highlightLines,
    className,
  } = props;

  // Discriminate: legacy flat-row list vs new hunk list. Empty arrays
  // default to the new shape.
  const isLegacy = useMemo(() => {
    if (!hunks || hunks.length === 0) return false;
    return !isHunk(hunks[0] as DiffHunk | LegacyDiffRow);
  }, [hunks]);

  // Default variant: `minimal` for legacy callers (preserves Wave 7
  // behaviour), `unified` for new-shape callers.
  const variant: DiffViewVariant = variantProp ?? (isLegacy ? 'minimal' : 'unified');

  const highlightSet = useMemo(() => new Set<number>(highlightLines ?? []), [highlightLines]);

  // Normalise to new-shape hunks for the unified / split renderers. Legacy
  // rows collapse into a single synthetic hunk so we can share machinery.
  const normalizedHunks: readonly DiffHunk[] = useMemo(() => {
    if (!hunks || hunks.length === 0) return [];
    if (!isLegacy) return hunks as readonly DiffHunk[];
    const lines: DiffLine[] = (hunks as readonly LegacyDiffRow[]).map((r) => {
      const out: DiffLine = { kind: normalizeKind(r.kind), content: r.line };
      if (r.oldNumber !== undefined) out.oldLineNumber = r.oldNumber;
      if (r.newNumber !== undefined) out.newLineNumber = r.newNumber;
      return out;
    });
    return [
      {
        oldStart: 1,
        oldLines: lines.filter((l) => l.kind !== 'add').length,
        newStart: 1,
        newLines: lines.filter((l) => l.kind !== 'del').length,
        lines,
      },
    ];
  }, [hunks, isLegacy]);

  // Per-hunk Shiki tokenisation. No-op when `language` is unset.
  const hunkHighlights = useHunkHighlights(normalizedHunks, language, theme);
  const highlightState: 'pending' | 'ready' | 'idle' = !language
    ? 'idle'
    : hunkHighlights.length === normalizedHunks.length
      ? 'ready'
      : 'pending';

  // `code`-only fallback: render a single non-decorated <pre>.
  const codeOnly = (!hunks || hunks.length === 0) && code !== undefined;

  return (
    <pre
      data-cir-component="DiffView"
      data-variant={variant}
      data-highlight-state={highlightState}
      className={cn(diffViewVariantClass[variant], className)}
      style={{
        margin: 0,
        fontFamily: 'ui-monospace, monospace',
        overflow: 'auto',
      }}
    >
      {codeOnly ? (
        <span data-cir-part="diff-code">{code}</span>
      ) : (
        normalizedHunks.map((hunk, hi) => {
          const hh = hunkHighlights[hi];
          const showHeader = !isLegacy && variant !== 'minimal';
          return (
            <div key={`hunk-${String(hi)}`} data-cir-part="diff-hunk" data-hunk-index={hi}>
              {showHeader ? (
                <div
                  data-cir-part="diff-hunk-header"
                  style={{ opacity: 0.6, padding: '4px 0', userSelect: 'none' }}
                >
                  {`@@ -${String(hunk.oldStart)},${String(hunk.oldLines)} +${String(
                    hunk.newStart,
                  )},${String(hunk.newLines)} @@`}
                </div>
              ) : null}
              {variant === 'split' ? (
                <SplitHunk hunk={hunk} hh={hh} linkLines={linkLines} highlightSet={highlightSet} />
              ) : (
                <UnifiedHunk
                  hunk={hunk}
                  hh={hh}
                  linkLines={linkLines}
                  highlightSet={highlightSet}
                />
              )}
              {hunk.contextHidden !== undefined &&
              hunk.contextHidden > 0 &&
              onExpandContext !== undefined ? (
                <button
                  type="button"
                  data-cir-part="diff-expand-context"
                  data-hunk-index={hi}
                  onClick={(): void => {
                    void onExpandContext(hi);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '4px 8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'ui-monospace, monospace',
                    opacity: 0.7,
                  }}
                >
                  {`Expand ${String(hunk.contextHidden)} lines`}
                </button>
              ) : null}
            </div>
          );
        })
      )}
    </pre>
  );
}

DiffView.displayName = 'DiffView';

// ---------------------------------------------------------------------------
// Sub-renderers for the two non-minimal variants
// ---------------------------------------------------------------------------

interface HunkRenderProps {
  hunk: DiffHunk;
  hh: HunkHighlight | undefined;
  linkLines: boolean;
  highlightSet: ReadonlySet<number>;
}

function UnifiedHunk({ hunk, hh, linkLines, highlightSet }: HunkRenderProps): ReactNode {
  return (
    <>
      {hunk.lines.map((line, i) => {
        const newNum = line.newLineNumber;
        const isHighlighted = newNum !== undefined && highlightSet.has(newNum);
        const rowId =
          newNum !== undefined
            ? `L${String(newNum)}`
            : line.oldLineNumber !== undefined
              ? `L${String(line.oldLineNumber)}`
              : undefined;
        const html =
          hh && hh.light[i] !== undefined && hh.dark[i] !== undefined
            ? { light: hh.light[i] ?? '', dark: hh.dark[i] ?? '' }
            : undefined;
        return (
          <UnifiedRow
            key={`row-${String(i)}`}
            line={line}
            highlightedHtml={html}
            linkLines={linkLines}
            isHighlighted={isHighlighted}
            rowId={rowId}
          />
        );
      })}
    </>
  );
}

function SplitHunk({ hunk, hh, linkLines, highlightSet }: HunkRenderProps): ReactNode {
  const pairs = useMemo(() => pairSplitRows(hunk.lines), [hunk.lines]);
  return (
    <>
      {pairs.map((p, i) => {
        const oldHtml =
          hh && p.old !== null && hh.light[p.old.index] !== undefined
            ? { light: hh.light[p.old.index] ?? '', dark: hh.dark[p.old.index] ?? '' }
            : undefined;
        const newHtml =
          hh && p.new !== null && hh.light[p.new.index] !== undefined
            ? { light: hh.light[p.new.index] ?? '', dark: hh.dark[p.new.index] ?? '' }
            : undefined;
        return (
          <SplitRow
            key={`split-${String(i)}`}
            oldLine={p.old?.line ?? null}
            newLine={p.new?.line ?? null}
            oldHtml={oldHtml}
            newHtml={newHtml}
            linkLines={linkLines}
            highlightSet={highlightSet}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Text-render (manifest fallback) + binding
// ---------------------------------------------------------------------------

export function diffViewTextRender(props: DiffViewProps): string {
  let adds = 0;
  let removes = 0;
  if (props.hunks) {
    for (const h of props.hunks) {
      if (isHunk(h)) {
        for (const l of h.lines) {
          if (l.kind === 'add') adds += 1;
          else if (l.kind === 'del') removes += 1;
        }
      } else {
        const k = normalizeKind(h.kind);
        if (k === 'add') adds += 1;
        else if (k === 'del') removes += 1;
      }
    }
  }
  return `[DiffView: +${String(adds)} -${String(removes)}]`;
}

export const DiffViewBinding: ComponentBinding = {
  id: 'DiffView',
  factory: DiffView,
};
