// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * ActionMenu — kebab/overflow controlled menu. Variants (Wave 6 / P-10):
 * primary, secondary (default), ghost, outline, destructive. Sizes: sm, md, lg.
 *
 * Radix pilot: keep Atelier's manifest-facing props and data attributes,
 * while delegating menu roles, roving focus, typeahead, Escape, and
 * outside-interaction handling to `@radix-ui/react-dropdown-menu`.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { actionVariantClass, cn, type ActionVariant, type Size } from './_variants.js';

export interface ActionMenuItem {
  id: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export type ActionMenuPlacement = 'bottom-start' | 'bottom-end';
export type ActionMenuVariant = ActionVariant;
export type ActionMenuSize = Size;

export interface ActionMenuProps {
  trigger: ReactNode;
  items: readonly ActionMenuItem[];
  placement?: ActionMenuPlacement;
  variant?: ActionMenuVariant;
  size?: ActionMenuSize;
  className?: string;
  'aria-label'?: string;
}

export function ActionMenu({
  trigger,
  items,
  placement = 'bottom-end',
  variant = 'secondary',
  size = 'md',
  className,
  'aria-label': ariaLabel = 'Actions',
}: ActionMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <div
        data-cir-component="ActionMenu"
        data-placement={placement}
        data-open={open ? 'true' : 'false'}
        data-variant={variant}
        data-size={size}
        className={cn(actionVariantClass[variant], className)}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            data-cir-part="action-menu-trigger"
            aria-label={typeof trigger === 'string' ? undefined : ariaLabel}
          >
            {trigger}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          align={placement === 'bottom-start' ? 'start' : 'end'}
          side="bottom"
          aria-label={ariaLabel}
          data-cir-part="action-menu-list"
          style={{
            position: 'absolute',
            margin: 0,
            padding: '4px',
            listStyle: 'none',
            minWidth: '160px',
            background: 'var(--atelier-bg-surface, white)',
            color: 'var(--atelier-fg-primary, #111827)',
            border: '1px solid var(--atelier-border-default, #d1d5db)',
            borderRadius: 'var(--atelier-radius-md, 6px)',
            boxShadow: 'var(--atelier-shadow-md, 0 12px 28px rgb(15 23 42 / 14%))',
            zIndex: 20,
          }}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              asChild
              {...(item.disabled !== undefined ? { disabled: item.disabled } : {})}
            >
              <button
                type="button"
                data-cir-part="action-menu-item"
                data-destructive={item.destructive ? 'true' : 'false'}
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  border: 0,
                  borderRadius: 'var(--atelier-radius-sm, 4px)',
                  background: 'transparent',
                  color: item.destructive
                    ? 'var(--atelier-fg-danger, #b91c1c)'
                    : 'var(--atelier-fg-primary, #111827)',
                  padding: '6px 8px',
                  textAlign: 'left',
                }}
              >
                {item.label}
              </button>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </div>
    </DropdownMenu.Root>
  );
}
ActionMenu.displayName = 'ActionMenu';
export function actionMenuTextRender(props: ActionMenuProps): string {
  return `[ActionMenu: ${String(props.items.length)} items]`;
}
export const ActionMenuBinding: ComponentBinding = { id: 'ActionMenu', factory: ActionMenu };
