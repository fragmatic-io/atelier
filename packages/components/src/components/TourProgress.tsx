// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

/**
 * TourProgress — small "step N of M" indicator for product-tour overlays.
 *
 * Wave 11 / Int-5 — onboarding microinteractions. Pairs with `<TourStep>`
 * (the highlight + tooltip card) to show how far along the tour the user
 * is. Three flavours that are all the same data, just different chrome:
 *   - `'dots'`     — N dots, the active one filled (default; Apple / Linear).
 *   - `'bar'`      — a thin progress bar with `current / total` aria text.
 *   - `'fraction'` — a plain `"3 / 5"` numeric display (compact / RTL-safe).
 *
 * Composition role: leaf — the count + total come from props, not children.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn } from './_variants.js';

export type TourProgressVariant = 'dots' | 'bar' | 'fraction';

export interface TourProgressProps {
  /** 1-indexed current step. Clamped into `[1, total]`. */
  current: number;
  /** Total number of steps. Must be >= 1. */
  total: number;
  /** Visual variant. Default `'dots'`. */
  variant?: TourProgressVariant;
  className?: string;
}

/** Clamp `n` into `[lo, hi]`. */
function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

export function TourProgress({
  current,
  total,
  variant = 'dots',
  className,
}: TourProgressProps): ReactNode {
  // Clamp inputs so a misbehaving host never blows up the indicator.
  const safeTotal = Math.max(1, Math.floor(total));
  const safeCurrent = clamp(Math.floor(current), 1, safeTotal);
  const percent = (safeCurrent / safeTotal) * 100;
  const ariaLabel = `Step ${String(safeCurrent)} of ${String(safeTotal)}`;

  if (variant === 'fraction') {
    return (
      <span
        data-cir-component="TourProgress"
        data-variant="fraction"
        data-current={safeCurrent}
        data-total={safeTotal}
        role="status"
        aria-label={ariaLabel}
        className={cn('text-xs text-gray-500 dark:text-gray-400', className)}
        style={{
          display: 'inline-block',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {`${String(safeCurrent)} / ${String(safeTotal)}`}
      </span>
    );
  }

  if (variant === 'bar') {
    const trackStyle: CSSProperties = {
      position: 'relative',
      width: '64px',
      height: '4px',
      borderRadius: '9999px',
      backgroundColor: 'rgba(0, 0, 0, 0.08)',
      overflow: 'hidden',
    };
    const fillStyle: CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      width: `${String(percent)}%`,
      backgroundColor: 'currentColor',
      borderRadius: '9999px',
    };
    return (
      <span
        data-cir-component="TourProgress"
        data-variant="bar"
        data-current={safeCurrent}
        data-total={safeTotal}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={1}
        aria-valuemax={safeTotal}
        aria-valuenow={safeCurrent}
        className={cn('text-blue-600 dark:text-blue-400', className)}
        style={{ display: 'inline-block', verticalAlign: 'middle' }}
      >
        <span data-cir-part="tour-progress-track" style={trackStyle}>
          <span data-cir-part="tour-progress-fill" style={fillStyle} />
        </span>
      </span>
    );
  }

  // Default: dots.
  const dots: ReactNode[] = [];
  for (let i = 1; i <= safeTotal; i += 1) {
    const active = i === safeCurrent;
    const done = i < safeCurrent;
    dots.push(
      <span
        key={i}
        data-cir-part="tour-progress-dot"
        data-state={active ? 'active' : done ? 'done' : 'pending'}
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: active ? '8px' : '6px',
          height: active ? '8px' : '6px',
          borderRadius: '9999px',
          backgroundColor: active ? 'currentColor' : 'rgba(0, 0, 0, 0.18)',
          transition: 'width 120ms ease, height 120ms ease',
        }}
      />,
    );
  }
  return (
    <span
      data-cir-component="TourProgress"
      data-variant="dots"
      data-current={safeCurrent}
      data-total={safeTotal}
      role="status"
      aria-label={ariaLabel}
      className={cn('text-blue-600 dark:text-blue-400', className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        verticalAlign: 'middle',
      }}
    >
      {dots}
    </span>
  );
}
TourProgress.displayName = 'TourProgress';

export function tourProgressTextRender(props?: Partial<TourProgressProps>): string {
  const p = props ?? {};
  const c = typeof p.current === 'number' ? p.current : 0;
  const t = typeof p.total === 'number' ? p.total : 0;
  if (t <= 0) return '[TourProgress]';
  return `[TourProgress: ${String(c)} / ${String(t)}]`;
}

export const TourProgressBinding: ComponentBinding = {
  id: 'TourProgress',
  factory: TourProgress as ComponentBinding['factory'],
  manifestContract: {
    description:
      'Compact "step N of M" indicator for product-tour overlays. Three variants: ' +
      '`dots` (default; one filled circle per step), `bar` (thin progress bar), ' +
      '`fraction` (`"3 / 5"` numeric). Pairs with `<TourStep>`.',
    allowed_props: {
      current: 'number',
      total: 'number',
      variant: 'string',
      className: 'string',
    },
  },
};
