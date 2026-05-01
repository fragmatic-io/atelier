// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `RateLimitChip` — small inline chip surfacing the cart-add quota the
 * `dummyjson.cart.add` capability declares (`60/min/user`). The catalog
 * brief calls for showing the policy concern in the header chrome rather
 * than as a card-sized block in the page body — the chip lives in the
 * NavBar's right-aligned slot and reads as plain ambient information.
 *
 * The component does not wire any live counter today; it just surfaces
 * the static quota so the policy `rate_limited_actions_show_state` is
 * satisfied somewhere on every route that exposes the action.
 */

import { type ReactNode } from 'react';

export interface RateLimitChipProps {
  /** "60 / 60s" by default. */
  label?: string;
  /** Tone for the dot — `idle` is calm green, `warning` warm orange. */
  tone?: 'idle' | 'warning';
}

export function RateLimitChip({
  label = '60 cart adds / 60s',
  tone = 'idle',
}: RateLimitChipProps): ReactNode {
  const dotColor = tone === 'warning' ? 'var(--cir-color-warning)' : 'var(--cir-color-success)';
  return (
    <div
      data-cir-component="RateLimitChip"
      role="status"
      aria-label={`Rate limit: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--cir-color-fg-muted)',
        background: 'var(--cir-color-bg-subtle)',
        border: '1px solid var(--cir-color-border-subtle)',
        borderRadius: 'var(--cir-radius-full)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
    </div>
  );
}
RateLimitChip.displayName = 'RateLimitChip';
