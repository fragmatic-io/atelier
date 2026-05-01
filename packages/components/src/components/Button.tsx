// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Button — action primitive. Variants (Wave 6 / P-10): primary (default),
 * secondary, ghost, outline, destructive. Sizes: sm, md (default), lg.
 *
 * Wave 7b (Vis-3): optional `icon` prop renders an `<Icon>` before the
 * children. The icon is decorative (aria-hidden) so the button's accessible
 * name still comes from `children` or an explicit `aria-label`.
 *
 * Phase 2 #2 — capability dispatch is first-class (ethos principle #8).
 * `ButtonBinding` declares `actionSlots: ['onPrimaryAction']`. The renderer
 * maps `node.actions[0]` to `props.onPrimaryAction`; this component wires
 * that handler to `onClick` (preventing the default form submission). No
 * dotted-key prop names ever reach `<button>`.
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
  /**
   * Manifest-friendly alias for `children`. When the manifest renderer
   * supplies `label: 'Save'`, fall back to it if `children` is empty.
   * Prefer `children` when both exist.
   */
  label?: string;
  /**
   * Manifest-driven primary action. The render-node wires
   * `node.actions[0]` to this prop (binding declares
   * `actionSlots: ['onPrimaryAction']`). When supplied without an explicit
   * `onClick`, the button binds it to `onClick` and prevents the default
   * to keep the manifest's intent fireable.
   */
  onPrimaryAction?: (input?: unknown) => unknown;
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
    label,
    onClick,
    onPrimaryAction,
    ...rest
  }: ButtonProps,
  ref,
): ReactNode {
  const handleClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] | undefined =
    onClick !== undefined
      ? onClick
      : onPrimaryAction !== undefined
        ? (event) => {
            event.preventDefault();
            onPrimaryAction();
          }
        : undefined;
  const resolvedChildren =
    children !== undefined && children !== null && children !== '' ? children : label;
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
      onClick={handleClick}
      {...rest}
    >
      {icon !== undefined ? (
        <Icon set={icon.set} name={icon.name} size={BUTTON_ICON_SIZE[size]} />
      ) : null}
      {resolvedChildren}
    </button>
  );
});

export function buttonTextRender(props: ButtonProps): string {
  const fromChildren =
    typeof props.children === 'string' || typeof props.children === 'number'
      ? String(props.children)
      : '';
  const text = fromChildren !== '' ? fromChildren : (props.label ?? '');
  return text !== '' ? `[Button: ${text}]` : '[Button]';
}
export const ButtonBinding: ComponentBinding = {
  id: 'Button',
  factory: Button,
  actionSlots: ['onPrimaryAction'],
};
