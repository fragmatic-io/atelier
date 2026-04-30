// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Stack — flex layout primitive. Variants (Wave 6 / P-10): bordered,
 * elevated, ghost (default), tinted.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, layoutVariantClass, type LayoutVariant } from './_variants.js';
import { DEFAULT_DENSITY, densityScaleGapPx, type Density } from './density.js';

export type StackDirection = 'vertical' | 'horizontal';
export type StackGap = 'sm' | 'md' | 'lg';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch';
export type StackVariant = LayoutVariant;

export interface StackProps {
  direction?: StackDirection;
  gap?: StackGap;
  align?: StackAlign;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: StackVariant;
  className?: string;
  children?: ReactNode;
}

export const STACK_GAP_PX: Readonly<Record<StackGap, number>> = Object.freeze({
  sm: 8,
  md: 16,
  lg: 24,
});
const ALIGN_TO_CSS: Readonly<Record<StackAlign, CSSProperties['alignItems']>> = Object.freeze({
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
});

export function Stack({
  direction = 'vertical',
  gap = 'md',
  align,
  density = DEFAULT_DENSITY,
  variant = 'ghost',
  className,
  children,
}: StackProps): ReactNode {
  const gapPx = densityScaleGapPx(STACK_GAP_PX[gap], density);
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: direction === 'vertical' ? 'column' : 'row',
    gap: `${String(gapPx)}px`,
  };
  if (align) style.alignItems = ALIGN_TO_CSS[align];
  return (
    <div
      role="group"
      data-cir-component="Stack"
      data-direction={direction}
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
Stack.displayName = 'Stack';
export function stackTextRender(props: StackProps): string {
  return `[Stack ${props.direction ?? 'vertical'}]`;
}
export const StackBinding: ComponentBinding = { id: 'Stack', factory: Stack };
