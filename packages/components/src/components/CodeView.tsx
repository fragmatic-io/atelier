// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * CodeView — read-only code display.
 *
 * Renders `<pre><code>` with the language hint surfaced as `data-language`
 * for downstream styling / tooling. Optionally prepends an `<ol>` of line
 * numbers as a flex sibling — a `<table>` would also work but pulls in
 * column-width layout machinery we don't need at this fidelity.
 *
 * ## Wave 11 / Cnt-1 — Shiki syntax highlighting
 *
 * When `language` is set to a Shiki grammar id (`'ts'`, `'tsx'`, `'json'`,
 * `'sh'`, `'sql'`, `'python'`, etc.) the component lazy-loads Shiki + the
 * grammar + the theme pair, then swaps in the highlighted HTML inline. The
 * raw code renders first as a `<pre>` (no layout shift); on resolve the
 * tokenised HTML replaces it.
 *
 * Shiki is an OPTIONAL peer dependency — if the host hasn't installed it,
 * the dynamic import rejects, the hook flips to `'error'`, and we render
 * the same plain `<pre>` as today's no-highlighting path. No crash.
 *
 * ### Output safety
 *
 * The highlighted HTML enters the DOM via `dangerouslySetInnerHTML`. This
 * is safe by construction because Shiki's `codeToHtml` HTML-entity-escapes
 * every token before wrapping it in `<span>` tags — there is no path for
 * raw user code to reach the DOM as markup. Hosts that pass Shiki options
 * via `transformers` should re-audit; today's fixed config has no such
 * surface.
 *
 * ### Dual-theme render (Vis-2)
 *
 * Shiki tokenises once and emits TWO `<pre>` siblings: `data-theme="light"`
 * and `data-theme="dark"`. CSS toggles visibility via the host's
 * `[data-color-mode]` attribute (mirrors every other variant table in
 * `_variants.ts`). Switching color mode is therefore a CSS-only paint, not
 * a React re-render or a Shiki re-tokenise.
 *
 * ### Folding, line refs, line highlights
 *
 * - `foldable` — when `true` AND lines > `FOLD_THRESHOLD` (20), shows a
 *   collapse/expand toggle that hides everything past the threshold.
 * - `linkLines` — adds `id="L<n>"` to each rendered line so URLs like
 *   `…/page#L42` scroll to the matching line. (Vercel's deploy log uses
 *   this exact contract.)
 * - `highlightLines` — sets `data-highlight="true"` on the matching lines
 *   so host CSS can paint a background row (e.g. a yellow gutter).
 */
import { useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { useHighlightedCode } from '../code/use-highlighted.js';
import { DEFAULT_SHIKI_THEME, type ShikiThemePair } from '../code/shiki.js';
import { cn, codeViewVariantClass, type CodeViewVariant } from './_variants.js';

/** Minimum line count before `foldable` shows the collapse control. */
export const FOLD_THRESHOLD = 20;

/** Visible-line count when a foldable block is collapsed. */
export const FOLD_COLLAPSED_LINES = 10;

export interface CodeViewProps {
  /** Raw source code; split on `\n` for line numbering and line-id work. */
  code: string;
  /**
   * Language id. When empty (default), no highlighting runs and the block
   * renders identically to pre-Cnt-1 behaviour. When set to a Shiki grammar
   * id (`'ts'`, `'tsx'`, `'json'`, `'sh'`, `'sql'`, `'python'`, etc.) the
   * component lazy-loads the grammar and renders highlighted HTML.
   */
  language?: string;
  /** Show a non-selectable gutter with 1-indexed line numbers. */
  showLineNumbers?: boolean;
  /** Class string forwarded to the outermost wrapper. */
  className?: string;
  /** Visual variant — see `_variants.ts`. */
  variant?: CodeViewVariant;
  /**
   * Shiki theme pair (Cnt-1). Defaults to GitHub light + dark; the dual
   * render lets dark-mode toggling be a pure CSS paint.
   */
  theme?: ShikiThemePair;
  /**
   * When true and lines > {@link FOLD_THRESHOLD}, show a collapse/expand
   * control that hides everything past {@link FOLD_COLLAPSED_LINES}.
   */
  foldable?: boolean;
  /** Lines (1-indexed) to mark with `data-highlight="true"`. */
  highlightLines?: readonly number[];
  /**
   * When true, every line gets `id="L<n>"` so deep-links (`#L42`) scroll
   * to the matching line. Mirrors Vercel / GitHub anchor contract.
   */
  linkLines?: boolean;
}

export function CodeView({
  code,
  language,
  showLineNumbers = false,
  className,
  variant = 'default',
  theme = DEFAULT_SHIKI_THEME,
  foldable = false,
  highlightLines,
  linkLines = false,
}: CodeViewProps): ReactNode {
  const lines = code.split('\n');
  // The 'numbered' variant always shows line numbers regardless of the
  // explicit prop — that's the whole point of the variant.
  const effectiveLineNumbers = variant === 'numbered' ? true : showLineNumbers;

  // Resolve Shiki async when a language is set. `''` short-circuits the
  // hook so the back-compat path costs nothing.
  const highlighted = useHighlightedCode(code, language ?? '', theme);

  // Fold state. The toggle only renders when foldable AND we're over the
  // line threshold — collapsed by default for foldable blocks.
  const [collapsed, setCollapsed] = useState(true);
  const canFold = foldable && lines.length > FOLD_THRESHOLD;
  const visibleLineCount =
    canFold && collapsed ? Math.min(lines.length, FOLD_COLLAPSED_LINES) : lines.length;
  const visibleLines = canFold && collapsed ? lines.slice(0, FOLD_COLLAPSED_LINES) : lines;

  // Highlight-line lookup as a Set for O(1) membership.
  const highlightSet = new Set<number>(highlightLines ?? []);

  // Whether we should render the highlighted HTML (Shiki resolved AND we
  // don't need per-line decorations that the raw HTML can't carry). When
  // `linkLines` / `highlightLines` / `canFold` is in play we render the
  // structured per-line view instead — the markup the hook returns is a
  // single `<pre>` blob and we'd need a parser to splice attributes in.
  const wantsPerLineDecoration = linkLines || highlightSet.size > 0 || canFold;
  const useHighlightedHtml = highlighted.state === 'ready' && !wantsPerLineDecoration;

  return (
    <div
      data-cir-component="CodeView"
      data-language={language && language.length > 0 ? language : 'plain'}
      data-variant={variant}
      data-highlight-state={highlighted.state}
      className={cn(codeViewVariantClass[variant], className)}
      style={{ display: 'flex', alignItems: 'stretch', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {effectiveLineNumbers ? (
          <ol
            data-cir-part="codeview-line-numbers"
            aria-hidden="true"
            style={{
              margin: 0,
              padding: '0 8px',
              listStyle: 'none',
              textAlign: 'right',
              userSelect: 'none',
              opacity: 0.6,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {visibleLines.map((_, i) => (
              <li key={`ln-${String(i)}`}>{i + 1}</li>
            ))}
          </ol>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          {useHighlightedHtml ? (
            <>
              <div
                data-cir-part="codeview-highlighted"
                data-theme="light"
                dangerouslySetInnerHTML={{ __html: highlighted.light }}
              />
              <div
                data-cir-part="codeview-highlighted"
                data-theme="dark"
                dangerouslySetInnerHTML={{ __html: highlighted.dark }}
              />
            </>
          ) : (
            <pre
              data-cir-part="codeview-pre"
              style={{
                margin: 0,
                padding: '0 8px',
                fontFamily: 'ui-monospace, monospace',
                overflow: 'auto',
              }}
            >
              {wantsPerLineDecoration ? (
                <code data-cir-part="codeview-code">
                  {visibleLines.map((line, i) => {
                    const lineNo = i + 1;
                    const isHighlighted = highlightSet.has(lineNo);
                    return (
                      <span
                        key={`L${String(lineNo)}`}
                        id={linkLines ? `L${String(lineNo)}` : undefined}
                        data-cir-part="codeview-line"
                        data-line={lineNo}
                        data-highlight={isHighlighted ? 'true' : undefined}
                        style={{ display: 'block' }}
                      >
                        {line}
                        {i < visibleLines.length - 1 ? '\n' : ''}
                      </span>
                    );
                  })}
                </code>
              ) : (
                <code data-cir-part="codeview-code">{code}</code>
              )}
            </pre>
          )}
        </div>
      </div>
      {canFold ? (
        <button
          type="button"
          data-cir-part="codeview-fold-toggle"
          data-collapsed={collapsed ? 'true' : 'false'}
          onClick={(): void => {
            setCollapsed((c) => !c);
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
          {collapsed
            ? `Show ${String(lines.length - visibleLineCount)} more lines`
            : 'Show fewer lines'}
        </button>
      ) : null}
    </div>
  );
}

CodeView.displayName = 'CodeView';

export function codeViewTextRender(props: CodeViewProps): string {
  const lines = props.code.split('\n').length;
  return `[CodeView: ${props.language ?? 'plain'} (${String(lines)} lines)]`;
}

export const CodeViewBinding: ComponentBinding = {
  id: 'CodeView',
  factory: CodeView,
};
