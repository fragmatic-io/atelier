// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * ButtonGroup — visually groups related action buttons. The group itself
 * carries `role="group"` plus a required `aria-label` so screen readers can
 * announce the cluster as a unit. Pure (no hooks); ref-forwarded so the host
 * can scroll the group into view or attach focus management externally.
 *
 * The group does NOT manage the focus ring — that is a CSS responsibility
 * (a Phase 4c stylesheet selects on `data-cir-component="ButtonGroup"` and
 * paints the shared focus-within ring). We just lay the children out
 * horizontally and surface the data hooks.
 */
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface ButtonGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  'aria-label': string;
  children: ReactNode;
}

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  { children, className, style, ...rest }: ButtonGroupProps,
  ref,
): ReactNode {
  return (
    <div
      ref={ref}
      role="group"
      data-cir-component="ButtonGroup"
      className={className}
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

export const ButtonGroupBinding: ComponentBinding = {
  id: 'ButtonGroup',
  factory: ButtonGroup,
};
