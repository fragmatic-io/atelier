// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * StatCard — single KPI tile. Variants (Wave 6 / P-10): default, accent,
 * muted. Sizes: sm, md (default), lg.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, statSizeClass, statVariantClass, type Size, type StatVariant } from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_PADDING_PX, type Density } from './density.js';

export type StatTrend = 'up' | 'down' | 'flat';
export type StatCardVariant = StatVariant;
export type StatCardSize = Size;

export interface StatCardDelta {
  value: string;
  trend: StatTrend;
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  delta?: StatCardDelta;
  helperText?: string;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: StatCardVariant;
  size?: StatCardSize;
  className?: string;
}

const TREND_GLYPH: Readonly<Record<StatTrend, string>> = Object.freeze({
  up: '▲',
  down: '▼',
  flat: '→',
});

export function StatCard({
  label,
  value,
  delta,
  helperText,
  density = DEFAULT_DENSITY,
  variant = 'default',
  size = 'md',
  className,
}: StatCardProps): ReactNode {
  const padPx = DENSITY_PADDING_PX[density];
  const style: CSSProperties = { padding: `${String(padPx)}px` };
  return (
    <section
      data-cir-component="StatCard"
      data-density={density}
      data-cir-density={density}
      data-variant={variant}
      data-size={size}
      aria-label={label}
      className={cn(statVariantClass[variant], statSizeClass[size], className)}
      style={style}
    >
      <p data-cir-part="stat-label">{label}</p>
      {/* Wave 11 / Vis-1 — KPI values are always numeric. We mark them with
          data-tnum="true" so brand kits that declare opentype.tabular_numerals
          can activate font-variant-numeric: tabular-nums via a single CSS
          rule. The marker is inert for kits that don't opt in. */}
      <p data-cir-part="stat-value" data-tnum="true">
        {value}
      </p>
      {delta !== undefined ? (
        <p data-cir-part="stat-delta" data-trend={delta.trend} data-tnum="true">
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
export const StatCardBinding: ComponentBinding = { id: 'StatCard', factory: StatCard };
