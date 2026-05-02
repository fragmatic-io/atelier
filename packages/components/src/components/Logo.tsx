// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

/**
 * Logo — brand mark + wordmark primitive.
 *
 * Subsumes the per-host `Wordmark` / `OctantHeader` / `MarigoldHeader` brand
 * customs the demos used to ship. With this in baseline, hosts compose
 * headers as `Stack(Logo, NavBar)` instead of writing bespoke chrome.
 *
 * Display modes (driven by which props are supplied):
 *   - `src` only          → just the mark (img)
 *   - `wordmark` only     → typographic wordmark text
 *   - both                → mark + wordmark, side by side (default lockup)
 *   - `glyph` only        → emoji / unicode glyph fallback (no asset needed)
 *
 * Sizes: `sm | md | lg | xl` map to a tight px scale matching the rest of
 * the catalog (14 / 20 / 28 / 40 px height for the mark; wordmark scales
 * via `font-size` proportionally).
 *
 * `href` wraps the lockup in a same-origin `<a>` so the logo doubles as a
 * "home" link without any router coupling.
 *
 * Accessibility: when `wordmark` is present it serves as the accessible name;
 * otherwise `alt` (required when `src` is set) becomes the name. A `glyph`
 * with no `wordmark`/`alt` is `aria-hidden`.
 *
 * Composition role: leaf. Manifests render Logo as a sibling of NavBar
 * inside a Stack, never as a child of NavBar.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn } from './_variants.js';

export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

const LOGO_MARK_PX: Readonly<Record<LogoSize, number>> = Object.freeze({
  sm: 14,
  md: 20,
  lg: 28,
  xl: 40,
});

const LOGO_WORDMARK_PX: Readonly<Record<LogoSize, number>> = Object.freeze({
  sm: 12,
  md: 14,
  lg: 18,
  xl: 24,
});

export interface LogoProps {
  /** Image source (SVG/PNG). Pair with `alt` for a11y. */
  src?: string;
  /** Required accessible name when `src` is set (falls back to wordmark). */
  alt?: string;
  /** Typographic wordmark text. Renders next to (or instead of) the mark. */
  wordmark?: string;
  /**
   * Emoji / unicode glyph used when no `src` is available. Renders with
   * `aria-hidden` unless `wordmark` or `alt` provides a name.
   */
  glyph?: string;
  /** Size token. Defaults to `'md'`. */
  size?: LogoSize;
  /** Optional link wrapping. Same-origin anchor; the host owns routing. */
  href?: string;
  className?: string;
}

export function Logo({
  src,
  alt,
  wordmark,
  glyph,
  size = 'md',
  href,
  className,
}: LogoProps): ReactNode {
  const markPx = LOGO_MARK_PX[size];
  const wordmarkPx = LOGO_WORDMARK_PX[size];
  const accessibleName = wordmark ?? alt ?? '';
  const hasName = accessibleName.length > 0;

  const markStyle: CSSProperties = {
    height: `${String(markPx)}px`,
    width: 'auto',
    display: 'inline-block',
    verticalAlign: 'middle',
  };
  const wordmarkStyle: CSSProperties = {
    fontSize: `${String(wordmarkPx)}px`,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    verticalAlign: 'middle',
  };
  const lockupStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  };

  let inner: ReactNode;
  if (src !== undefined) {
    inner = (
      <span style={lockupStyle}>
        <img
          src={src}
          alt={hasName ? '' : (alt ?? '')}
          data-cir-part="logo-mark"
          style={markStyle}
        />
        {wordmark !== undefined ? (
          <span data-cir-part="logo-wordmark" style={wordmarkStyle}>
            {wordmark}
          </span>
        ) : null}
      </span>
    );
  } else if (glyph !== undefined) {
    inner = (
      <span style={lockupStyle} aria-hidden={hasName ? undefined : 'true'}>
        <span data-cir-part="logo-glyph" style={{ fontSize: `${String(markPx)}px` }}>
          {glyph}
        </span>
        {wordmark !== undefined ? (
          <span data-cir-part="logo-wordmark" style={wordmarkStyle}>
            {wordmark}
          </span>
        ) : null}
      </span>
    );
  } else if (wordmark !== undefined) {
    inner = (
      <span data-cir-part="logo-wordmark" style={wordmarkStyle}>
        {wordmark}
      </span>
    );
  } else {
    // Defensive: nothing to render. Returning null avoids an empty host element.
    return null;
  }

  const dataAttrs = {
    'data-cir-component': 'Logo',
    'data-size': size,
  } as const;

  if (href !== undefined) {
    return (
      <a
        href={href}
        className={cn(className)}
        aria-label={hasName ? accessibleName : undefined}
        {...dataAttrs}
      >
        {inner}
      </a>
    );
  }
  return (
    <span
      className={cn(className)}
      role={hasName ? 'img' : undefined}
      aria-label={hasName ? accessibleName : undefined}
      {...dataAttrs}
    >
      {inner}
    </span>
  );
}

Logo.displayName = 'Logo';

export function logoTextRender(props: LogoProps): string {
  const name = props.wordmark ?? props.alt ?? props.glyph ?? '';
  return name.length > 0 ? `[Logo: ${name}]` : '[Logo]';
}

export const LogoBinding: ComponentBinding = {
  id: 'Logo',
  factory: Logo as ComponentBinding['factory'],
  manifestContract: {
    description:
      'Brand mark + wordmark primitive. Subsumes per-host Wordmark/Header customs. Renders an ' +
      '<img>, an emoji/unicode glyph, a typographic wordmark, or a lockup of mark + wordmark — ' +
      'driven by which of `src`/`glyph`/`wordmark` are supplied. Compose as a sibling of `<NavBar>` ' +
      'inside a `<Stack>` to build a header; never as a child of NavBar (NavBar is a leaf).',
    allowed_props: {
      src: 'string',
      alt: 'string',
      wordmark: 'string',
      glyph: 'string',
      size: 'string',
      href: 'string',
      className: 'string',
    },
  },
};
