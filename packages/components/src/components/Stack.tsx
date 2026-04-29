// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Stack — flex layout primitive. Vertical or horizontal grouping of children
 * with a discrete `gap` token. Uses semantic `<div role="group">` because a
 * stack is by definition a related collection of elements.
 *
 * Inline styles are intentional: this package ships zero CSS so adapters
 * can layer their own design system on top via `className` and `data-*`
 * selectors. The token map below (`sm/md/lg`) is the canonical mapping that
 * all gap-aware components share.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export type StackDirection = 'vertical' | 'horizontal';
export type StackGap = 'sm' | 'md' | 'lg';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch';

export interface StackProps {
  direction?: StackDirection;
  gap?: StackGap;
  align?: StackAlign;
  className?: string;
  children?: ReactNode;
}

/** Canonical gap tokens. Adapters MAY remap via CSS but the px values are the source of truth. */
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
  className,
  children,
}: StackProps): ReactNode {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: direction === 'vertical' ? 'column' : 'row',
    gap: `${String(STACK_GAP_PX[gap])}px`,
  };
  if (align) style.alignItems = ALIGN_TO_CSS[align];
  return (
    <div
      role="group"
      data-cir-component="Stack"
      data-direction={direction}
      data-gap={gap}
      className={className}
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

export const StackBinding: ComponentBinding = {
  id: 'Stack',
  factory: Stack,
};
