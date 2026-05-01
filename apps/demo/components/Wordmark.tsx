// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Wordmark — the demo's chrome mark.
 *
 * "CIR" rendered as a custom geometric letterform with a small status dot
 * to the right of the R, suggesting "live". Sized to a 24px line so it
 * sits comfortably alongside the chrome's status pill and nav links.
 *
 * Theming: paths use `currentColor`, so wrapping the component in any
 * coloured container (e.g. `<a className="text-fg">`) re-tints the mark.
 * The status dot uses the Aurora accent token via `var(--cir-color-accent)`.
 *
 * Letterforms: drawn on a 64×24 canvas, 4px stroke, geometric (no curves
 * other than the dot) — readable at the chrome's height without anti-alias
 * fuzz. The proportions match Linear's wordmark cadence: tight tracking,
 * monoline weight, optical alignment around the cap height.
 */

import type { CSSProperties } from 'react';

interface WordmarkProps {
  /** Height in CSS pixels. Defaults to 24. */
  size?: number;
  /** Whether the live-status dot is shown. Defaults to true. */
  showDot?: boolean;
  /** Optional className to compose with chrome layout utilities. */
  className?: string;
  /** Optional accessible label override; defaults to "CIR". */
  ariaLabel?: string;
}

export function Wordmark({
  size = 24,
  showDot = true,
  className,
  ariaLabel = 'CIR',
}: WordmarkProps): React.JSX.Element {
  // ViewBox is 64x24 — three letterforms (16px wide each, 4px gutters)
  // plus an optional 6px-radius dot at the right edge.
  const style: CSSProperties = { height: `${String(size)}px`, width: 'auto' };

  return (
    <svg
      data-cir-component="Wordmark"
      role="img"
      aria-label={ariaLabel}
      viewBox="0 0 72 24"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      {...(className !== undefined ? { className } : {})}
    >
      {/*
        Letter C — open square missing the right side, geometric.
        Coords on a 4-unit grid: (2,2)→(14,2)→(14,6) top, (14,18)→(14,22)→(2,22) bottom.
       */}
      <path
        d="M14 4 L4 4 L4 20 L14 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {/*
        Letter I — single vertical stroke at x=24.
       */}
      <path
        d="M24 4 L24 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
      />
      {/*
        Letter R — vertical stem at x=36, top horizontal to x=46, right vertical
        from y=4 to y=12, mid horizontal from x=46 to x=36, then a diagonal leg
        from (36,12) to (48,20).
       */}
      <path
        d="M36 20 L36 4 L46 4 L48 6 L48 10 L46 12 L36 12 L48 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {/*
        Live-status dot — Aurora accent (cyan). Reads as "active" alongside
        the wordmark; matches the recency-signal usage of the accent token.
       */}
      {showDot ? (
        <circle cx="60" cy="12" r="3" fill="var(--cir-color-accent, #67e8f9)" aria-hidden="true" />
      ) : null}
    </svg>
  );
}

export default Wordmark;
