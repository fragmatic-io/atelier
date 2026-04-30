// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Grid — CSS grid primitive. Variants (Wave 6 / P-10): bordered, elevated,
 * ghost (default), tinted.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { STACK_GAP_PX, type StackGap } from './Stack.js';
import { cn, layoutVariantClass, type LayoutVariant } from './_variants.js';
import { DEFAULT_DENSITY, densityScaleGapPx, type Density } from './density.js';

export type GridColumns = number | 'auto';
export type GridVariant = LayoutVariant;

export interface GridProps {
  columns?: GridColumns;
  gap?: StackGap;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: GridVariant;
  className?: string;
  children?: ReactNode;
}

const AUTO_TRACK = 'repeat(auto-fit, minmax(200px, 1fr))';

export function Grid({
  columns = 'auto',
  gap = 'md',
  density = DEFAULT_DENSITY,
  variant = 'ghost',
  className,
  children,
}: GridProps): ReactNode {
  const tracks = columns === 'auto' ? AUTO_TRACK : `repeat(${String(columns)}, 1fr)`;
  const gapPx = densityScaleGapPx(STACK_GAP_PX[gap], density);
  const style: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: tracks,
    gap: `${String(gapPx)}px`,
  };
  return (
    <div
      data-cir-component="Grid"
      data-columns={String(columns)}
      data-gap={gap}
      data-density={density}
      data-variant={variant}
      className={cn(layoutVariantClass[variant], className)}
      style={style}
    >
      {children}
    </div>
  );
}
Grid.displayName = 'Grid';
export function gridTextRender(props: GridProps): string {
  return `[Grid ${String(props.columns ?? 'auto')}]`;
}
export const GridBinding: ComponentBinding = { id: 'Grid', factory: Grid };
