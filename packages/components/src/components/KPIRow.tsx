// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * KPIRow — a row of `StatCard` tiles laid out in a CSS grid. The `columns`
 * prop caps the visual width (default = stats.length, ceiling 4). The row
 * itself is a `<section role="group">` so screen readers announce it as a
 * grouping landmark; each tile is a `StatCard`, reused as-is.
 *
 * Pure (no hooks). The component is a thin layout wrapper — every visual
 * detail of an individual tile lives in `StatCard`.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { StatCard, type StatCardDelta } from './StatCard.js';

export interface KPIStat {
  id: string;
  label: string;
  value: ReactNode;
  delta?: StatCardDelta;
}

export interface KPIRowProps {
  stats: readonly KPIStat[];
  columns?: number;
  className?: string;
  'aria-label'?: string;
}

const MAX_COLUMNS = 4;

export function KPIRow({
  stats,
  columns,
  className,
  'aria-label': ariaLabel = 'Key metrics',
}: KPIRowProps): ReactNode {
  const requested = columns ?? stats.length;
  const cols = Math.max(1, Math.min(MAX_COLUMNS, requested));
  return (
    <section
      role="group"
      aria-label={ariaLabel}
      data-cir-component="KPIRow"
      data-columns={String(cols)}
      className={className}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${String(cols)}, 1fr)`, gap: '16px' }}
    >
      {stats.map((s) =>
        s.delta !== undefined ? (
          <StatCard key={s.id} label={s.label} value={s.value} delta={s.delta} />
        ) : (
          <StatCard key={s.id} label={s.label} value={s.value} />
        ),
      )}
    </section>
  );
}

KPIRow.displayName = 'KPIRow';

export function kpiRowTextRender(props: KPIRowProps): string {
  return `[KPIRow: ${String(props.stats.length)} stats]`;
}

export const KPIRowBinding: ComponentBinding = {
  id: 'KPIRow',
  factory: KPIRow,
};
