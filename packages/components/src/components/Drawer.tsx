// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * Drawer — controlled side sheet rendered as `<aside role="dialog">`. The
 * `side` prop is surfaced as `data-cir-side` so a Phase 4c CSS layer can
 * paint the slide-in transform per edge. We render the aside whenever
 * `open` is true; closing unmounts it, which keeps focus management simple
 * and matches the platform expectation that a hidden aside is gone.
 *
 * Escape closes via a window-level keydown listener (no `<dialog>` here —
 * an aside attaches to layout flow more naturally and we don't need the
 * top-layer behaviour). An outside-click closes via a transparent backdrop
 * sibling.
 */
import { useEffect, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export type DrawerSide = 'left' | 'right' | 'top' | 'bottom';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  title?: string;
  className?: string;
  children?: ReactNode;
}

export function Drawer({
  open,
  onClose,
  side = 'right',
  title,
  className,
  children,
}: DrawerProps): ReactNode {
  // Escape-to-close at the document level so the host doesn't need a
  // focused descendant for the key to fire.
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
    <div data-cir-component="Drawer" data-cir-side={side} className={className}>
      <div
        data-cir-part="drawer-backdrop"
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
        }}
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

export const DrawerBinding: ComponentBinding = {
  id: 'Drawer',
  factory: Drawer,
};
