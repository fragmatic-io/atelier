// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors

'use client';
/**
 * Drawer — controlled side sheet. Variants (Wave 6 / P-10): bordered,
 * elevated (default), ghost, tinted.
 */
import { useEffect, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, layoutVariantClass, type LayoutVariant } from './_variants.js';

export type DrawerSide = 'left' | 'right' | 'top' | 'bottom';
export type DrawerVariant = LayoutVariant;

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  title?: string;
  variant?: DrawerVariant;
  className?: string;
  children?: ReactNode;
}

export function Drawer({
  open,
  onClose,
  side = 'right',
  title,
  variant = 'elevated',
  className,
  children,
}: DrawerProps): ReactNode {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return (): void => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      data-cir-component="Drawer"
      data-cir-side={side}
      data-variant={variant}
      className={cn(layoutVariantClass[variant], className)}
    >
      <div
        data-cir-part="drawer-backdrop"
        aria-hidden="true"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)' }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-cir-part="drawer-panel"
        data-cir-side={side}
      >
        {title !== undefined ? (
          <header data-cir-part="drawer-header">
            <h2 data-cir-part="drawer-title">{title}</h2>
          </header>
        ) : null}
        <div data-cir-part="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
Drawer.displayName = 'Drawer';
export function drawerTextRender(props: DrawerProps): string {
  const head = props.title !== undefined ? `: ${props.title}` : '';
  return `[Drawer(${props.side ?? 'right'})${head}]`;
}
export const DrawerBinding: ComponentBinding = { id: 'Drawer', factory: Drawer };
