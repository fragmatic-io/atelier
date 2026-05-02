// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * ButtonGroup — visually groups related action buttons.
 * Variants (Wave 6 / P-10): primary, secondary (default), ghost, outline,
 * destructive. Sizes: sm, md (default), lg.
 */
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { actionVariantClass, cn, type ActionVariant, type Size } from './_variants.js';

export type ButtonGroupVariant = ActionVariant;
export type ButtonGroupSize = Size;

export interface ButtonGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  'aria-label': string;
  variant?: ButtonGroupVariant;
  size?: ButtonGroupSize;
  children: ReactNode;
}

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  { children, className, style, variant = 'secondary', size = 'md', ...rest }: ButtonGroupProps,
  ref,
): ReactNode {
  return (
    <div
      ref={ref}
      role="group"
      data-cir-component="ButtonGroup"
      data-variant={variant}
      data-size={size}
      className={cn(actionVariantClass[variant], className)}
      style={{ display: 'inline-flex', gap: '4px', ...style }}
      {...rest}
    >
      {children}
    </div>
  );
});

export function buttonGroupTextRender(props: ButtonGroupProps): string {
  return `[ButtonGroup: ${props['aria-label']}]`;
}
export const ButtonGroupBinding: ComponentBinding = { id: 'ButtonGroup', factory: ButtonGroup };
