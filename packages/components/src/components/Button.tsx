// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Button — action primitive. Variants (Wave 6 / P-10): primary (default),
 * secondary, ghost, outline, destructive. Sizes: sm, md (default), lg.
 *
 * Wave 7b (Vis-3): optional `icon` prop renders an `<Icon>` before the
 * children. The icon is decorative (aria-hidden) so the button's accessible
 * name still comes from `children` or an explicit `aria-label`.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import {
  actionSizeClass,
  actionVariantClass,
  cn,
  iconSizePx,
  type ActionVariant,
  type Size,
} from './_variants.js';
import { Icon } from './Icon.js';

export type ButtonVariant = ActionVariant;
export type ButtonSize = Size;

/** Map button size to the canonical icon px from the `iconSizePx` table. */
const BUTTON_ICON_SIZE: Readonly<Record<ButtonSize, number>> = Object.freeze({
  sm: iconSizePx.xs,
  md: iconSizePx.sm,
  lg: iconSizePx.md,
});

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: 'button' | 'submit' | 'reset';
  /** Optional leading icon. Resolved via `IconResolverContext`; decorative (aria-hidden). */
  icon?: { set: string; name: string };
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    type = 'button',
    icon,
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
      style={{
        cursor: 'pointer',
        padding: '8px 16px',
        display: icon !== undefined ? 'inline-flex' : undefined,
        alignItems: icon !== undefined ? 'center' : undefined,
        gap: icon !== undefined ? 6 : undefined,
        ...style,
      }}
      {...rest}
    >
      {icon !== undefined ? (
        <Icon set={icon.set} name={icon.name} size={BUTTON_ICON_SIZE[size]} />
      ) : null}
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
