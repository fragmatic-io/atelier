// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * Split — controlled splitter pane with a draggable divider.
 *
 * Two children are arranged via CSS grid; the first pane's size (% of the
 * cross-axis) is internal state seeded by `defaultSize`. The divider is a
 * `<div role="separator">` with `aria-orientation` and `aria-valuenow`.
 *
 * Pointer events (not mouse-only) are used so touch + stylus + mouse all
 * drag with the same code path. We capture the pointer on `pointerdown`,
 * track movement on `pointermove`, and release on `pointerup` / cancel.
 * Movement is converted to a percentage relative to the container's
 * bounding box so the math is independent of pixel size.
 *
 * `minSize` clamps both panes — i.e. the first pane can range from `minSize`
 * to `100 - minSize`. This avoids accidental collapses while still letting
 * Phase 6 layouts opt in to true-zero collapse via a future prop.
 */
import { useCallback, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface SplitProps {
  orientation?: 'horizontal' | 'vertical';
  defaultSize?: number;
  minSize?: number;
  children: readonly [ReactNode, ReactNode];
  onResize?: (size: number) => void;
  className?: string;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function Split({
  orientation = 'horizontal',
  defaultSize = 50,
  minSize = 10,
  children,
  onResize,
  className,
}: SplitProps): ReactNode {
  const [size, setSize] = useState<number>(defaultSize);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<boolean>(false);
  const [first, second] = children;

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number): void => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = orientation === 'horizontal' ? rect.width : rect.height;
      if (total <= 0) return;
      const offset = orientation === 'horizontal' ? clientX - rect.left : clientY - rect.top;
      const pct = (offset / total) * 100;
      const next = clamp(pct, minSize, 100 - minSize);
      setSize(next);
      onResize?.(next);
    },
    [minSize, onResize, orientation],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const gridTemplate =
    orientation === 'horizontal'
      ? { gridTemplateColumns: `${String(size)}% 6px ${String(100 - size)}%` }
      : { gridTemplateRows: `${String(size)}% 6px ${String(100 - size)}%` };

  return (
    <div
      ref={containerRef}
      data-cir-component="Split"
      data-orientation={orientation}
      className={className}
      style={{
        display: 'grid',
        width: '100%',
        height: '100%',
        ...gridTemplate,
      }}
    >
      <div data-cir-part="split-pane" data-cir-pane="first">
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(size)}
        aria-valuemin={minSize}
        aria-valuemax={100 - minSize}
        data-cir-part="split-divider"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          cursor: orientation === 'horizontal' ? 'col-resize' : 'row-resize',
          background: 'rgba(0,0,0,0.1)',
          touchAction: 'none',
        }}
      />
      <div data-cir-part="split-pane" data-cir-pane="second">
        {second}
      </div>
    </div>
  );
}

Split.displayName = 'Split';

export function splitTextRender(props: SplitProps): string {
  return `[Split ${props.orientation ?? 'horizontal'}]`;
}

export const SplitBinding: ComponentBinding = {
  id: 'Split',
  factory: Split,
};
