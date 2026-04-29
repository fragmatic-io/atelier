// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * Toast — controlled, transient announcement. Mirrors Alert's role mapping
 * (`error` / `warning` → `role="alert"`, otherwise `role="status"` with
 * `aria-live="polite"`) so the message is announced when it appears.
 *
 * Auto-close: when `open` becomes true, a timer fires `onClose` after
 * `duration` ms. The timer is cleared if `open` flips back to false (or on
 * unmount). `duration` of 0 disables auto-close — the host owns dismissal.
 *
 * Positioning is intentionally minimal: `position: fixed` at the bottom-
 * right is the conservative default. A Phase 4c CSS pass can override via
 * the `data-cir-component="Toast"` selector.
 */
import { useEffect, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import type { AlertSeverity } from './Alert.js';

export interface ToastProps {
  message: string;
  open: boolean;
  onClose: () => void;
  severity?: AlertSeverity;
  duration?: number;
  className?: string;
}

export function Toast({
  message,
  open,
  onClose,
  severity = 'info',
  duration = 4000,
  className,
}: ToastProps): ReactNode {
  useEffect(() => {
    if (!open || duration <= 0) return;
    const id = setTimeout(() => {
      onClose();
    }, duration);
    return (): void => {
      clearTimeout(id);
    };
  }, [open, duration, onClose]);

  if (!open) return null;

  const role = severity === 'error' || severity === 'warning' ? 'alert' : 'status';
  return (
    <output
      role={role}
      aria-live="polite"
      data-cir-component="Toast"
      data-severity={severity}
      className={className}
      style={{ position: 'fixed', right: '16px', bottom: '16px' }}
    >
      {message}
    </output>
  );
}

Toast.displayName = 'Toast';

export function toastTextRender(props: ToastProps): string {
  return `[Toast(${props.severity ?? 'info'}): ${props.message}]`;
}

export const ToastBinding: ComponentBinding = {
  id: 'Toast',
  factory: Toast,
};
