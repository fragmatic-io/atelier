// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * StatCard — a single KPI tile: label, value, optional delta with a trend
 * arrow direction, optional helper text. Rendered as a `<section>` so it is
 * a landmark for screen readers when laid out in a grid (the `Grid of
 * StatCards = Dashboard` composition pattern from the catalog).
 *
 * Independently keyed from Card — composition rules treat a StatCard as a
 * leaf, not as a Card subclass. Pure (no hooks).
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export type StatTrend = 'up' | 'down' | 'flat';

export interface StatCardDelta {
  value: string;
  trend: StatTrend;
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  delta?: StatCardDelta;
  helperText?: string;
  className?: string;
}

const TREND_GLYPH: Readonly<Record<StatTrend, string>> = Object.freeze({
  up: '▲',
  down: '▼',
  flat: '→',
});

export function StatCard({ label, value, delta, helperText, className }: StatCardProps): ReactNode {
  return (
    <section data-cir-component="StatCard" aria-label={label} className={className}>
      <p data-cir-part="stat-label">{label}</p>
      <p data-cir-part="stat-value">{value}</p>
      {delta !== undefined ? (
        <p data-cir-part="stat-delta" data-trend={delta.trend}>
          <span aria-hidden="true">{TREND_GLYPH[delta.trend]}</span> <span>{delta.value}</span>
        </p>
      ) : null}
      {helperText !== undefined ? <p data-cir-part="stat-helper">{helperText}</p> : null}
    </section>
  );
}

StatCard.displayName = 'StatCard';

export function statCardTextRender(props: StatCardProps): string {
  const v =
    typeof props.value === 'string' || typeof props.value === 'number' ? String(props.value) : '';
  return v !== '' ? `[Stat: ${props.label} = ${v}]` : `[Stat: ${props.label}]`;
}

export const StatCardBinding: ComponentBinding = {
  id: 'StatCard',
  factory: StatCard,
};
