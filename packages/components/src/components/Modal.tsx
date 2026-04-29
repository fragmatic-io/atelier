// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * Modal — controlled modal dialog backed by HTML `<dialog>`. Like
 * ConfirmDialog we lean on the platform for focus trap, the inert backdrop,
 * Escape-to-cancel, and ARIA semantics. Unlike ConfirmDialog, Modal is the
 * generic surface — the host owns the body content (via children) and any
 * action bar. We deliberately do NOT auto-focus a specific element; the
 * `<dialog>` element handles initial focus, and the host can grab it from
 * within `children` if a particular control should receive it.
 *
 * Backdrop click closes (a click on the dialog *element* rect that is
 * outside its content box). Escape closes via the native `cancel` event.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  size?: ModalSize;
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
  className,
  children,
}: ModalProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Sync `open` with the dialog element's modal state.
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

  // Mirror the native `cancel` (Escape) event onto onClose.
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
      aria-labelledby="cir-modal-title"
      className={className}
      style={{ width: SIZE_PX[size], maxWidth: '100%' }}
      onClick={(e): void => {
        // Backdrop click: the click hits the dialog element itself (not a
        // descendant), which is the conventional way to detect an outside
        // press on a native <dialog>.
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

export const ModalBinding: ComponentBinding = {
  id: 'Modal',
  factory: Modal,
};
