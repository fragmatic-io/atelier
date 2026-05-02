// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * ConfirmDialog — controlled confirmation modal backed by HTML `<dialog>`.
 *
 * Why `<dialog>`: the platform gives us focus trapping, the inert backdrop,
 * Escape-to-cancel, and the right ARIA semantics for free. We just sync the
 * `open` prop with `showModal()` / `close()`.
 *
 * Focus management: we focus the *cancel* button on open. This is the
 * conservative default (preserves the "cancel by accident is harmless"
 * invariant); destructive variants explicitly invert the visual emphasis
 * via the confirm button's `data-variant`, but the focus stays on cancel.
 *
 * This component is used both:
 *  (a) inline inside compiled manifests when the layout includes a
 *      ConfirmDialog node, AND
 *  (b) by the Phase 4b React adapter as the renderer for
 *      `ConfirmationCallback` requests originating from the action
 *      dispatcher (the adapter wires open/close itself).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { Button } from './Button.js';
import { cn, confirmDialogVariantClass, type ConfirmDialogVariant } from './_variants.js';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  destructive?: boolean;
  className?: string;
  /**
   * Vis-4 visual variant. Defaults to `'destructive'` when the legacy
   * `destructive` boolean is true so existing callers continue to render
   * the red-tinted surface; otherwise defaults to `'default'`.
   */
  variant?: ConfirmDialogVariant;
  /**
   * Phase 2 #2 — manifest-driven primary capability dispatcher. When a
   * manifest declares `actions: ['some.cap', ...]` on a `ConfirmDialog`
   * node, the render-node wires `actions[0]` to this slot. If supplied
   * without an explicit `onConfirm`, the dialog dispatches it on confirm.
   * The legacy `onConfirm` callback wins when both are supplied.
   */
  onPrimaryAction?: (input?: unknown) => unknown;
  /**
   * Manifest-driven secondary capability dispatcher; bound to `actions[1]`.
   * Most callers leave this unset (cancel is local UI, not a capability).
   * Declared for the actionSlots contract.
   */
  onSecondaryAction?: (input?: unknown) => unknown;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
  className,
  variant,
  // Manifest-bound capability dispatchers. `onConfirm` (the explicit React
  // callback) wins; `onPrimaryAction` is the fallback when a manifest wires
  // a capability without supplying a JS callback.
  onPrimaryAction,
  onSecondaryAction: _onSecondaryAction,
}: ConfirmDialogProps): ReactNode {
  const effectiveVariant: ConfirmDialogVariant =
    variant ?? (destructive ? 'destructive' : 'default');
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);

  // Sync `open` with the dialog element's modal state.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      // showModal may not exist in jsdom-style envs; use open attribute as fallback
      if (typeof dlg.showModal === 'function') {
        try {
          dlg.showModal();
        } catch {
          dlg.setAttribute('open', '');
        }
      } else {
        dlg.setAttribute('open', '');
      }
      // Focus cancel after the dialog has rendered.
      cancelRef.current?.focus();
    } else if (!open && dlg.open) {
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }
  }, [open]);

  // The native `<dialog>` fires `cancel` on Escape; mirror it to onCancel.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handle = (e: Event): void => {
      e.preventDefault();
      onCancel();
    };
    dlg.addEventListener('cancel', handle);
    return (): void => {
      dlg.removeEventListener('cancel', handle);
    };
  }, [onCancel]);

  const handleConfirm = (): void => {
    const result = onConfirm();
    // Also fire the manifest-driven primary capability when present, so a
    // manifest-only dialog (no JS `onConfirm` host wiring) still dispatches.
    if (onPrimaryAction) {
      try {
        onPrimaryAction();
      } catch {
        // Swallow — capability dispatchers surface their own errors via
        // the framework toast / audit log.
      }
    }
    if (result instanceof Promise) {
      setBusy(true);
      void result.finally(() => {
        setBusy(false);
      });
    }
  };

  return (
    <dialog
      ref={dialogRef}
      data-cir-component="ConfirmDialog"
      data-destructive={destructive ? 'true' : 'false'}
      data-variant={effectiveVariant}
      aria-labelledby="cir-confirm-title"
      aria-describedby={description !== undefined ? 'cir-confirm-desc' : undefined}
      className={cn(confirmDialogVariantClass[effectiveVariant], className)}
    >
      <h2 id="cir-confirm-title">{title}</h2>
      {description !== undefined ? <p id="cir-confirm-desc">{description}</p> : null}
      <div data-cir-part="confirm-actions">
        <Button ref={cancelRef} variant="ghost" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'primary'}
          onClick={handleConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

ConfirmDialog.displayName = 'ConfirmDialog';

export function confirmDialogTextRender(props: ConfirmDialogProps): string {
  return `[Confirm: ${props.title}]`;
}

export const ConfirmDialogBinding: ComponentBinding = {
  id: 'ConfirmDialog',
  factory: ConfirmDialog,
  actionSlots: ['onPrimaryAction', 'onSecondaryAction'],
};
