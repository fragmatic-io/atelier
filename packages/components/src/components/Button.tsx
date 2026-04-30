// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Button — action primitive. Variants (Wave 6 / P-10): primary (default),
 * secondary, ghost, outline, destructive. Sizes: sm, md (default), lg.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import {
  actionSizeClass,
  actionVariantClass,
  cn,
  type ActionVariant,
  type Size,
} from './_variants.js';

export type ButtonVariant = ActionVariant;
export type ButtonSize = Size;

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    type = 'button',
    className,
    style,
    children,
    ...rest
  }: ButtonProps,
  ref,
): ReactNode {
  return (
    <button
      ref={ref}
      type={type}
      data-cir-component="Button"
      data-variant={variant}
      data-size={size}
      className={cn(actionVariantClass[variant], actionSizeClass[size], className)}
      style={{ cursor: 'pointer', padding: '8px 16px', ...style }}
      {...rest}
    >
      {children}
    </button>
  );
});

export function buttonTextRender(props: ButtonProps): string {
  const label =
    typeof props.children === 'string' || typeof props.children === 'number'
      ? String(props.children)
      : '';
  return label !== '' ? `[Button: ${label}]` : '[Button]';
}
export const ButtonBinding: ComponentBinding = { id: 'Button', factory: Button };
