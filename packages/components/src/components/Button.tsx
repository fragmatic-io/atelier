// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Button — action primitive. Variants (Wave 6 / P-10): primary (default),
 * secondary, ghost, outline, destructive. Sizes: sm, md (default), lg.
 *
 * Wave 7b (Vis-3): optional `icon` prop renders an `<Icon>` before the
 * children. The icon is decorative (aria-hidden) so the button's accessible
 * name still comes from `children` or an explicit `aria-label`.
 *
 * Wave 11 / Vis-3 finalisation: `icon` accepts EITHER a bare string
 * (`<Button icon="archive">`) — resolved against the default
 * `'lucide'` set — OR a `{ set, name }` object for hosts that wire a
 * non-default pack. Both shapes go through `IconResolverContext`.
 *
 * Phase 2 #1 — manifest contract is schema-validated. `ButtonBinding`
 * declares `manifestContract`; the `manifest_component_contract_satisfied`
 * policy walks the manifest tree and rejects unknown / wrong-typed props
 * at compile time. Replaces the implicit forgiveness band-aid from commit
 * 9ae2122.
 *
 * Phase 2 #2 — capability dispatch is first-class. `ButtonBinding`
 * declares `actionSlots: ['onPrimaryAction']`. The renderer maps
 * `node.actions[0]` to `props.onPrimaryAction`; this component wires that
 * handler to `onClick` (preventing the default form submission). No
 * dotted-key prop names ever reach `<button>` — `partitionCapabilityProps`
 * was the band-aid; it's now gone.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import {
  actionSizeClass,
  actionVariantClass,
  cn,
  iconSizePx,
  type ActionVariant,
  type Size,
} from './_variants.js';
import { Icon } from './Icon.js';
import { normalizeIconRef, type IconRef } from '../icons/icon-ref.js';

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
  /**
   * Optional leading icon. Accepts a bare string (`'archive'`) which
   * resolves against the default `'lucide'` set, or `{ set, name }` for
   * hosts that wire a non-default pack. Resolved via `IconResolverContext`;
   * decorative (aria-hidden).
   */
  icon?: IconRef;
  children?: ReactNode;
  /**
   * Manifest contract slot for the button's accessible name. Manifests
   * commonly ship `label: 'Save'` (a JSON-friendly shape) rather than a
   * `children` react-node. Component renders `label` when `children`
   * is empty. Both are declared in `ButtonBinding.manifestContract`.
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
      {icon !== undefined
        ? (() => {
            const ref = normalizeIconRef(icon);
            return <Icon set={ref.set} name={ref.name} size={BUTTON_ICON_SIZE[size]} />;
          })()
        : null}
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
  manifestContract: {
    description:
      'Action primitive. Manifests typically supply `label` (rendered as button text); `children` is permitted for hosts that nest react-nodes. `variant`, `size`, `type` enumerate the visual contract. `icon` is either a kebab-case lucide name string (e.g. `"archive"`) — resolved against the default `"lucide"` set — or a `{ set, name }` bag for hosts that wire non-default packs. The capability dispatcher (`actions: ["…"]`) is wired by the renderer to `onPrimaryAction` via `actionSlots` — manifests never declare `onPrimaryAction` directly.',
    allowed_props: {
      label: 'string',
      children: 'react-node',
      variant: 'string',
      size: 'string',
      type: 'string',
      // `icon` is `string | { set, name }`; the contract type tag is a
      // single string, so we use `'unknown'` to permit either shape and
      // rely on the runtime normaliser. The shape is documented above.
      icon: 'unknown',
      className: 'string',
      style: 'object',
      // Generic accessibility / DOM hooks that flow through `...rest`.
      // Listed so manifests can supply them without tripping unknown-key
      // violations. Anything else fails the policy.
      'aria-label': 'string',
      'aria-hidden': 'boolean',
      'data-cir-policy-anchor': 'string',
      disabled: 'boolean',
      onClick: 'function',
    },
  },
};
