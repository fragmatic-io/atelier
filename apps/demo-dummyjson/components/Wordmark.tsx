// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Wordmark — Marigold identity for the dummyjson catalog demo.
 *
 * A small SVG combining a stylised parcel-icon mark with the wordmark
 * "DummyJSON Shop". Sits ~24-28px tall in the chrome. The icon uses
 * the brand primary (`var(--cir-color-primary)`) and the letterforms
 * use `currentColor` so they ride the chrome's foreground in both
 * light and dark modes without a separate dark variant.
 *
 * The geometry:
 *   - A rounded square parcel base (12 radius).
 *   - A horizontal "tape" band at 60% height.
 *   - A vertical "tape" band at 50% width — the two cross like a
 *     ribbon. Together they read as "package" without becoming
 *     literal.
 *
 * Friendly geometric letterform: 600 weight Inter at 14px, slight
 * negative tracking. The display word ("DummyJSON") is bold; the
 * follow-on noun ("Shop") is medium so the eye anchors on the brand
 * before the category.
 */

import type { CSSProperties } from 'react';

interface WordmarkProps {
  /** Total rendered height in pixels. Defaults to 26. */
  size?: number;
  /** Optional inline style override (forwarded to the wrapper). */
  style?: CSSProperties;
  /** Optional class hook for layout-side overrides. */
  className?: string;
  /** Hide the wordmark text and render the parcel mark only (icon-only). */
  iconOnly?: boolean;
}

export function Wordmark({
  size = 26,
  style,
  className,
  iconOnly = false,
}: WordmarkProps): React.JSX.Element {
  const iconSize = size;
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily:
          'var(--cir-font-display, Inter, ui-sans-serif, system-ui, -apple-system, sans-serif)',
        fontWeight: 600,
        fontSize: Math.round(size * 0.62),
        letterSpacing: '-0.012em',
        color: 'currentColor',
        lineHeight: 1,
        ...style,
      }}
      aria-label="DummyJSON Shop"
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        {/* Parcel base — rounded square in the brand primary. */}
        <rect
          x="2"
          y="2"
          width="28"
          height="28"
          rx="7"
          ry="7"
          fill="var(--cir-color-primary, #ff5f3a)"
        />
        {/* Horizontal tape band. */}
        <rect x="2" y="14" width="28" height="4" fill="rgba(255, 255, 255, 0.92)" />
        {/* Vertical tape band. */}
        <rect x="14" y="2" width="4" height="28" fill="rgba(255, 255, 255, 0.92)" />
        {/* Tape knot — small dot at the centre to soften the cross. */}
        <circle cx="16" cy="16" r="2.4" fill="var(--cir-color-primary, #ff5f3a)" />
      </svg>
      {!iconOnly && (
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
          <span style={{ fontWeight: 700 }}>DummyJSON</span>
          <span style={{ fontWeight: 500, color: 'var(--cir-color-fg-muted, #8a7d70)' }}>Shop</span>
        </span>
      )}
    </span>
  );
}
