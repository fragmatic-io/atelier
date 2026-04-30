// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * ActionMenu — kebab/overflow controlled menu. Variants (Wave 6 / P-10):
 * primary, secondary (default), ghost, outline, destructive. Sizes: sm, md, lg.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return (): void => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div
      data-cir-component="ActionMenu"
      data-placement={placement}
      data-open={open ? 'true' : 'false'}
      data-variant={variant}
      data-size={size}
      className={cn(actionVariantClass[variant], className)}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        ref={triggerRef}
        type="button"
        data-cir-part="action-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        {trigger}
      </button>
      {open ? (
        <ul
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          data-cir-part="action-menu-list"
          style={{
            position: 'absolute',
            top: '100%',
            left: placement === 'bottom-start' ? 0 : 'auto',
            right: placement === 'bottom-end' ? 0 : 'auto',
            margin: 0,
            padding: 0,
            listStyle: 'none',
            minWidth: '160px',
            background: 'white',
            border: '1px solid #ddd',
          }}
        >
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                data-cir-part="action-menu-item"
                data-destructive={item.destructive ? 'true' : 'false'}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect();
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                style={{ display: 'block', width: '100%', textAlign: 'left' }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
ActionMenu.displayName = 'ActionMenu';
export function actionMenuTextRender(props: ActionMenuProps): string {
  return `[ActionMenu: ${String(props.items.length)} items]`;
}
export const ActionMenuBinding: ComponentBinding = { id: 'ActionMenu', factory: ActionMenu };
