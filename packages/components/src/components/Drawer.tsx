// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors

'use client';
/**
 * Drawer — controlled side sheet. Variants (Wave 6 / P-10): bordered,
 * elevated (default), ghost, tinted.
 *
 * Wave 11 / Int-1 — opt-in entry/exit transition. When `animated` is set,
 * the drawer panel slides in from the `side`'s edge (translate axis
 * derived from `side`) with a paired opacity ramp; on `open=false` the
 * inverse plays out under `easing.in`. Defaults to off for back-compat.
 * Honours `prefers-reduced-motion`. Backdrop fades to/from `rgba(0,0,0,0.4)`
 * over the same duration so the two halves of the drawer move together.
 */
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, elevationClass, layoutVariantClass, type LayoutVariant } from './_variants.js';
import { useComponentTransition, type TransitionDuration } from './_transition.js';

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
  /**
   * Wave 11 / Int-1 — when true, the drawer animates entry (translate
   * from edge → 0 + opacity 0 → 1) and exit (reverse) using the brand
   * kit's motion scale. Defaults to false for back-compat.
   */
  animated?: boolean;
  /**
   * Wave 11 / Int-1 — duration override. Names from the brand kit
   * scale (`'fast' | 'normal' | 'slow'`) OR raw ms. Defaults to `'normal'`.
   */
  duration?: TransitionDuration;
}

/**
 * Resolve the panel's offstage transform. The `side` determines the
 * axis: left/right slide on X, top/bottom on Y; the offstage value is
 * 100% of the panel's own dimension so the panel sits exactly outside
 * the viewport edge before the entry tween commits.
 */
function offstageTransform(side: DrawerSide): string {
  if (side === 'left') return 'translateX(-100%)';
  if (side === 'right') return 'translateX(100%)';
  if (side === 'top') return 'translateY(-100%)';
  return 'translateY(100%)';
}

export function Drawer({
  open,
  onClose,
  side = 'right',
  title,
  variant = 'elevated',
  className,
  children,
  animated = false,
  duration,
}: DrawerProps): ReactNode {
  const {
    phase,
    style: motionStyle,
    reducedMotion,
    durationMs,
  } = useComponentTransition({
    in: open,
    enabled: animated,
    ...(duration !== undefined ? { duration } : {}),
  });
  // The drawer must stay mounted through the exit animation when animated.
  const visible = animated ? phase !== 'exited' : open;

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
  if (!visible) return null;
  // Per-component motion grammar — the panel slides in from the chosen
  // edge. Reduced-motion gates the transform off so the panel just
  // appears (matching the existing back-compat behaviour).
  const panelTransform: CSSProperties =
    animated && !reducedMotion
      ? { transform: phase === 'entered' ? 'translate3d(0,0,0)' : offstageTransform(side) }
      : {};
  const panelTransition: CSSProperties =
    animated && !reducedMotion
      ? {
          transition: `transform ${String(durationMs)}ms var(--cir-easing-${
            phase === 'exiting' ? 'in' : 'out'
          }, cubic-bezier(0,0,0.2,1)), opacity ${String(durationMs)}ms var(--cir-easing-${
            phase === 'exiting' ? 'in' : 'out'
          }, cubic-bezier(0,0,0.2,1))`,
        }
      : {};
  // Backdrop fades on the same timeline so the chrome doesn't pop.
  const backdropOpacity = animated && !reducedMotion ? (phase === 'entered' ? 1 : 0) : 1;
  const backdropTransition: CSSProperties =
    animated && !reducedMotion
      ? { transition: `opacity ${String(durationMs)}ms cubic-bezier(0,0,0.2,1)` }
      : {};
  return (
    <div
      data-cir-component="Drawer"
      data-cir-side={side}
      data-variant={variant}
      data-elevation="modal"
      {...(animated ? { 'data-transition-phase': phase, 'data-animated': 'true' } : {})}
      className={cn(layoutVariantClass[variant], elevationClass.modal, className)}
    >
      <div
        data-cir-part="drawer-backdrop"
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: `rgba(0,0,0,${String(0.4 * backdropOpacity)})`,
          ...backdropTransition,
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-cir-part="drawer-panel"
        data-cir-side={side}
        style={{ ...motionStyle, ...panelTransform, ...panelTransition }}
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
