// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors

'use client';
/**
 * Modal — controlled <dialog>. Variants (Wave 6 / P-10): bordered,
 * elevated (default), ghost, tinted.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, layoutVariantClass, type LayoutVariant } from './_variants.js';

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
}

const SIZE_PX: Readonly<Record<ModalSize, string>> = Object.freeze({
  sm: '320px',
  md: '560px',
  lg: '880px',
});

export function Modal({
  open,
  title,
  onClose,
  size = 'md',
  variant = 'elevated',
  className,
  children,
}: ModalProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      if (typeof dlg.showModal === 'function') {
        try {
          dlg.showModal();
        } catch {
          dlg.setAttribute('open', '');
        }
      } else {
        dlg.setAttribute('open', '');
      }
    } else if (!open && dlg.open) {
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }
  }, [open]);
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
  return (
    <dialog
      ref={dialogRef}
      data-cir-component="Modal"
      data-size={size}
      data-variant={variant}
      aria-labelledby="cir-modal-title"
      className={cn(layoutVariantClass[variant], className)}
      style={{ width: SIZE_PX[size], maxWidth: '100%' }}
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
