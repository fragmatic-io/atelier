// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors

'use client';
/**
 * Modal — controlled <dialog>. Variants (Wave 6 / P-10): bordered,
 * elevated (default), ghost, tinted.
 *
 * Wave 7 / P-7: opt-in entry/exit transition. When `animated` is set,
 * the dialog walks `entering` → `entered` → `exiting` → `exited` and
 * exposes the phase via `data-transition-phase` for host CSS to pick up
 * a scale / opacity recipe. Defaults to off for back-compat — existing
 * tests assert that `data-size` / `data-variant` are unchanged.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  durationFor,
  isReducedMotion,
  readMotionTokens,
  type ComponentBinding,
  type TransitionPhase,
} from '@atelier/runtime';
import { cn, elevationClass, layoutVariantClass, type LayoutVariant } from './_variants.js';

export type ModalSize = 'sm' | 'md' | 'lg';
export type ModalVariant = LayoutVariant;

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  size?: ModalSize;
  variant?: ModalVariant;
  className?: string;
  children?: ReactNode;
  /**
   * When true, the modal animates entry (scale 0.95 → 1, opacity 0 → 1)
   * and exit (reverse) using the brand kit's `motion.duration_scale`.
   * Defaults to false for back-compat. Honours `prefers-reduced-motion`.
   */
  animated?: boolean;
}

const SIZE_PX: Readonly<Record<ModalSize, string>> = Object.freeze({
  sm: '320px',
  md: '560px',
  lg: '880px',
});

/**
 * Local phase machine — Modal can't pull in `@atelier/react`'s
 * `useTransition` because `@atelier/components` does not depend on the
 * React adapter (it sits underneath). The hook lives in `@atelier/react`
 * for app code; this inlining keeps the dependency direction clean.
 */
function useModalTransition(
  open: boolean,
  enabled: boolean,
): {
  phase: TransitionPhase['phase'];
  style: CSSProperties;
} {
  const [phase, setPhase] = useState<TransitionPhase['phase']>(() =>
    open ? (enabled ? 'entering' : 'entered') : 'exited',
  );
  const lastOpenRef = useRef<boolean>(open);

  useEffect(() => {
    if (!enabled) {
      setPhase(open ? 'entered' : 'exited');
      lastOpenRef.current = open;
      return;
    }
    const ms = isReducedMotion() ? 0 : durationFor('normal');
    if (open && !lastOpenRef.current) {
      setPhase('entering');
      lastOpenRef.current = true;
      const t = setTimeout(() => setPhase('entered'), ms);
      return () => clearTimeout(t);
    }
    if (!open && lastOpenRef.current) {
      setPhase('exiting');
      lastOpenRef.current = false;
      const t = setTimeout(() => setPhase('exited'), ms);
      return () => clearTimeout(t);
    }
    if (open && phase === 'entering') {
      const t = setTimeout(() => setPhase('entered'), ms);
      return () => clearTimeout(t);
    }
    return;
    // Phase intentionally excluded — same rationale as in
    // `useTransition`: this is a prop-flip effect, not a phase tick.
  }, [open, enabled]);

  if (!enabled) {
    return { phase, style: {} };
  }
  const tokens = readMotionTokens();
  const reduced = isReducedMotion();
  const ms = reduced ? 0 : tokens.duration.normal;
  const easing = phase === 'exiting' ? tokens.easing.in : tokens.easing.out;
  const opacity = phase === 'entered' ? 1 : 0;
  const transform = phase === 'entered' ? 'scale(1)' : 'scale(0.95)';
  const style: CSSProperties = reduced
    ? { opacity: phase === 'entered' ? 1 : 0 }
    : {
        opacity,
        transform,
        transition: `opacity ${ms}ms ${easing}, transform ${ms}ms ${easing}`,
      };
  return { phase, style };
}

export function Modal({
  open,
  title,
  onClose,
  size = 'md',
  variant = 'elevated',
  className,
  children,
  animated = false,
}: ModalProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const { phase, style: motionStyle } = useModalTransition(open, animated);
  // The dialog must stay mounted through the exit animation, so we use
  // the phase machine's view of "is anything visible" rather than `open`.
  const showDialog = animated ? phase !== 'exited' : open;
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (showDialog && !dlg.open) {
      if (typeof dlg.showModal === 'function') {
        try {
          dlg.showModal();
        } catch {
          dlg.setAttribute('open', '');
        }
      } else {
        dlg.setAttribute('open', '');
      }
    } else if (!showDialog && dlg.open) {
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }
  }, [showDialog]);
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handle = (e: Event): void => {
      e.preventDefault();
      onClose();
    };
    dlg.addEventListener('cancel', handle);
    return (): void => {
      dlg.removeEventListener('cancel', handle);
    };
  }, [onClose]);
  const baseStyle: CSSProperties = { width: SIZE_PX[size], maxWidth: '100%' };
  return (
    <dialog
      ref={dialogRef}
      data-cir-component="Modal"
      data-size={size}
      data-variant={variant}
      data-elevation="modal"
      {...(animated ? { 'data-transition-phase': phase, 'data-animated': 'true' } : {})}
      aria-labelledby="cir-modal-title"
      className={cn(layoutVariantClass[variant], elevationClass.modal, className)}
      style={{ ...baseStyle, ...motionStyle }}
      onClick={(e): void => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <header data-cir-part="modal-header">
        <h2 id="cir-modal-title">{title}</h2>
      </header>
      <div data-cir-part="modal-body">{children}</div>
    </dialog>
  );
}
Modal.displayName = 'Modal';
export function modalTextRender(props: ModalProps): string {
  return `[Modal: ${props.title}]`;
}
export const ModalBinding: ComponentBinding = { id: 'Modal', factory: Modal };
