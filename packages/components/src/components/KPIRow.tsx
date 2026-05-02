// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * KPIRow — row of StatCard tiles. Variants (Wave 6 / P-10): default
 * (default), accent, muted. Sizes: sm, md (default), lg.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { StatCard, type StatCardDelta } from './StatCard.js';
import { cn, statSizeClass, statVariantClass, type Size, type StatVariant } from './_variants.js';
import { DEFAULT_DENSITY, densityScaleGapPx, type Density } from './density.js';

export type KPIRowVariant = StatVariant;
export type KPIRowSize = Size;

export interface KPIStat {
  id: string;
  label: string;
  value: ReactNode;
  delta?: StatCardDelta;
}

export interface KPIRowProps {
  stats: readonly KPIStat[];
  columns?: number;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: KPIRowVariant;
  size?: KPIRowSize;
  className?: string;
  'aria-label'?: string;
}

const MAX_COLUMNS = 4;
const KPIROW_BASE_GAP_PX = 16;

export function KPIRow({
  stats,
  columns,
  density = DEFAULT_DENSITY,
  variant = 'default',
  size = 'md',
  className,
  'aria-label': ariaLabel = 'Key metrics',
}: KPIRowProps): ReactNode {
  const requested = columns ?? stats.length;
  const cols = Math.max(1, Math.min(MAX_COLUMNS, requested));
  const gapPx = densityScaleGapPx(KPIROW_BASE_GAP_PX, density);
  return (
    <section
      role="group"
      aria-label={ariaLabel}
      data-cir-component="KPIRow"
      data-columns={String(cols)}
      data-density={density}
      data-variant={variant}
      data-size={size}
      className={cn(statVariantClass[variant], statSizeClass[size], className)}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${String(cols)}, 1fr)`,
        gap: `${String(gapPx)}px`,
      }}
    >
      {stats.map((s) =>
        s.delta !== undefined ? (
          <StatCard
            key={s.id}
            label={s.label}
            value={s.value}
            delta={s.delta}
            density={density}
            variant={variant}
            size={size}
          />
        ) : (
          <StatCard
            key={s.id}
            label={s.label}
            value={s.value}
            density={density}
            variant={variant}
            size={size}
          />
        ),
      )}
    </section>
  );
}
KPIRow.displayName = 'KPIRow';
export function kpiRowTextRender(props: KPIRowProps): string {
  return `[KPIRow: ${String(props.stats.length)} stats]`;
}
export const KPIRowBinding: ComponentBinding = { id: 'KPIRow', factory: KPIRow };
