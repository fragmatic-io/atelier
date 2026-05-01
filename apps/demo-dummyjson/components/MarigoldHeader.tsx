// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `MarigoldHeader` — the persistent app chrome for `apps/demo-dummyjson`.
 *
 * One row, retail-density:
 *   - Wordmark on the left (parcel-ribbon SVG + "DummyJSON Shop" lockup).
 *   - Primary nav inline (Browse / Cart / Lens).
 *   - Small rate-limit chip on the right — `60 cart adds / 60s` style.
 *
 * Rendered through the manifest pipeline as the first child of every
 * route's `<Stack>`. Mirrors `OctantHeader` from `apps/demo-github` so the
 * Gemini compiler has a single header binding to reach for, instead of
 * trying to compose a `<NavBar>` (leaf) with a `<RateLimitChip>` sibling
 * (which the LLM kept getting wrong by stuffing children into NavBar).
 *
 * Per `docs/ethos.md` principle #2 (composition, not invention): the
 * compiler picks this binding because the catalog description says to
 * use it for chrome.
 */

import Link from 'next/link';
import { Wordmark } from './Wordmark';

interface NavItem {
  readonly label: string;
  readonly href: string;
}

const DEFAULT_NAV: readonly NavItem[] = [
  { label: 'Browse', href: '/browse' },
  { label: 'Cart', href: '/cart' },
  { label: 'Lens', href: '/settings/lens' },
];

export interface MarigoldHeaderProps {
  /** Override the nav (mostly for SSR chrome edge cases). */
  items?: readonly NavItem[];
  /** Currently-active path; gets a brand-coloured underline. */
  activePath?: string;
  /**
   * Display string for the rate-limit chip on the right. Static for now —
   * dummyjson's cart capability declares 60 adds/60s. Hosts can supply a
   * dynamic state via the chip's data binding (RateLimitChip reads it).
   */
  quotaLabel?: string;
}

export function MarigoldHeader({
  items = DEFAULT_NAV,
  activePath,
  quotaLabel = '60 cart adds / 60s',
}: MarigoldHeaderProps): React.JSX.Element {
  return (
    <header
      data-cir-component="MarigoldHeader"
      className="flex items-center gap-4"
      style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--cir-color-border, rgba(0,0,0,0.08))',
        background: 'var(--cir-color-surface, #fffaf3)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <Link
        href="/browse"
        className="flex items-center"
        style={{ color: 'var(--cir-color-fg)', textDecoration: 'none' }}
        aria-label="DummyJSON Shop home"
      >
        <Wordmark size={26} />
      </Link>
      <nav className="flex items-center" style={{ marginLeft: 12, gap: 4 }} aria-label="Primary">
        {items.map((item) => {
          const active = activePath === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                fontSize: '14px',
                padding: '6px 12px',
                borderRadius: 'var(--cir-radius-md, 8px)',
                color: active
                  ? 'var(--cir-color-fg)'
                  : 'var(--cir-color-fg-muted, rgba(0,0,0,0.65))',
                textDecoration: 'none',
                fontWeight: active ? 600 : 500,
                background: active
                  ? 'color-mix(in srgb, var(--cir-color-primary, #ff5f3a) 10%, transparent)'
                  : 'transparent',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <span
        data-cir-part="rate-limit-chip"
        title={`Cart-add rate limit — ${quotaLabel}`}
        style={{
          fontSize: '12px',
          fontFamily: 'var(--cir-font-mono, monospace)',
          padding: '4px 12px',
          borderRadius: '999px',
          background: 'color-mix(in srgb, var(--cir-color-success, #0d8a72) 12%, transparent)',
          color: 'var(--cir-color-success, #0d8a72)',
          border:
            '1px solid color-mix(in srgb, var(--cir-color-success, #0d8a72) 25%, transparent)',
          letterSpacing: '0.02em',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--cir-color-success, #0d8a72)',
          }}
        />
        {quotaLabel}
      </span>
    </header>
  );
}

MarigoldHeader.displayName = 'MarigoldHeader';
