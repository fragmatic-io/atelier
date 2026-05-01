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
  /**
   * Manifest-friendly alias for `children`. When the manifest renderer
   * supplies `label: 'Save'`, fall back to it if `children` is empty.
   * Prefer `children` when both exist.
   */
  label?: string;
}

/**
 * Strip prop names that aren't valid React DOM attributes. The manifest
 * renderer wires capability dispatchers as `props['app.cart.add'] = fn`,
 * which React DOM rejects on a `<button>`. We pull those out and bind
 * the first one to `onClick` so the manifest's intent (a button that
 * triggers an action) actually fires.
 */
function partitionCapabilityProps(rest: Record<string, unknown>): {
  domSafe: Record<string, unknown>;
  firstAction: ((input?: unknown) => unknown) | null;
} {
  const domSafe: Record<string, unknown> = {};
  let firstAction: ((input?: unknown) => unknown) | null = null;
  for (const [key, value] of Object.entries(rest)) {
    if (key.includes('.') && typeof value === 'function') {
      if (firstAction === null) {
        firstAction = value as (input?: unknown) => unknown;
      }
      continue; // do not forward to DOM
    }
    domSafe[key] = value;
  }
  return { domSafe, firstAction };
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
    ...rest
  }: ButtonProps,
  ref,
): ReactNode {
  const { domSafe, firstAction } = partitionCapabilityProps(rest);
  const handleClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] | undefined =
    onClick !== undefined
      ? onClick
      : firstAction !== null
        ? (event) => {
            event.preventDefault();
            firstAction();
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
      {...domSafe}
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
export const ButtonBinding: ComponentBinding = { id: 'Button', factory: Button };
