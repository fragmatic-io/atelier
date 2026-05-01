// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

import * as React from 'react';

/**
 * `Wordmark` — the Octant lockup.
 *
 * An octagon mark plus the lowercase "octant" wordmark in mono. Renders
 * at ~24 px height by default; both fills resolve to `currentColor` so
 * the chrome can recolour the mark by setting `color` on the wrapper.
 *
 * The octagon is drawn with eight equally-spaced vertices on a 24-unit
 * canvas; the inner stroke draws a smaller octagon for visual depth.
 * The wordmark sits to the right at 14 px in IBM Plex Mono.
 */

interface WordmarkProps {
  /** Pixel height. Defaults to 24. Width scales proportionally. */
  height?: number;
  /** Tooltip / a11y label. Defaults to "Octant". */
  title?: string;
  /** Hide the text, keeping only the octagon mark. Default false. */
  markOnly?: boolean;
  className?: string;
}

export function Wordmark({
  height = 24,
  title = 'Octant',
  markOnly = false,
  className,
}: WordmarkProps): React.JSX.Element {
  // Round to one decimal — JS FP arithmetic can leave a `0.6000…01` tail
  // on `height * 4.4`, which makes static-markup snapshots flaky.
  const totalWidth = markOnly ? height : Math.round(height * 44) / 10;
  return (
    <svg
      role="img"
      aria-label={title}
      width={totalWidth}
      height={height}
      viewBox={markOnly ? '0 0 24 24' : '0 0 106 24'}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {/* Outer octagon — the geometry that names the brand. */}
      <polygon
        points="7,2 17,2 22,7 22,17 17,22 7,22 2,17 2,7"
        fill="currentColor"
        opacity="0.12"
      />
      <polygon
        points="7,2 17,2 22,7 22,17 17,22 7,22 2,17 2,7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Inner octagon — depth cue. */}
      <polygon points="9,6 15,6 18,9 18,15 15,18 9,18 6,15 6,9" fill="currentColor" />
      {markOnly ? null : (
        <text
          x="30"
          y="17"
          fontFamily="'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace"
          fontSize="14"
          fontWeight="500"
          letterSpacing="-0.02em"
          fill="currentColor"
        >
          octant
        </text>
      )}
    </svg>
  );
}
