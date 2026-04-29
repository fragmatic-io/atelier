// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Grid — CSS grid primitive. Either an explicit fixed column count or `auto`,
 * which produces a responsive `auto-fit` track that grows and shrinks based
 * on container width.
 *
 * `<div role="grid">` is *not* used because the WAI-ARIA grid role implies
 * keyboard navigation semantics (cells, rows, columns) we don't implement.
 * A simple `<div>` is correct for visual grids.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { STACK_GAP_PX, type StackGap } from './Stack.js';

export type GridColumns = number | 'auto';

export interface GridProps {
  columns?: GridColumns;
  gap?: StackGap;
  className?: string;
  children?: ReactNode;
}

const AUTO_TRACK = 'repeat(auto-fit, minmax(200px, 1fr))';

export function Grid({ columns = 'auto', gap = 'md', className, children }: GridProps): ReactNode {
  const tracks = columns === 'auto' ? AUTO_TRACK : `repeat(${String(columns)}, 1fr)`;
  const style: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: tracks,
    gap: `${String(STACK_GAP_PX[gap])}px`,
  };
  return (
    <div
      data-cir-component="Grid"
      data-columns={String(columns)}
      data-gap={gap}
      className={className}
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

export const GridBinding: ComponentBinding = {
  id: 'Grid',
  factory: Grid,
};
