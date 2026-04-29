// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Button — minimally-styled action primitive. Variants are surfaced as
 * `data-variant` so a Phase 4c CSS layer can paint them; the only baked-in
 * styling is `cursor: pointer` + a small `padding` so the button is usable
 * before any CSS lands.
 *
 * Ref-forwarded for focus management (e.g. ConfirmDialog grabs the cancel
 * button on open).
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', type = 'button', className, style, children, ...rest }: ButtonProps,
  ref,
): ReactNode {
  return (
    <button
      ref={ref}
      type={type}
      data-cir-component="Button"
      data-variant={variant}
      className={className}
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

export const ButtonBinding: ComponentBinding = {
  id: 'Button',
  factory: Button,
};
