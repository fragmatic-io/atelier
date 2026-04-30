// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * Toast — controlled transient announcement. Variants (Wave 6 / P-10):
 * info (default), success, warning, error. `severity` is a legacy alias.
 */
import { useEffect, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import type { AlertSeverity } from './Alert.js';
import { cn, displayVariantClass, type DisplayVariant } from './_variants.js';

export type ToastVariant = DisplayVariant;

export interface ToastProps {
  message: string;
  open: boolean;
  onClose: () => void;
  severity?: AlertSeverity;
  variant?: ToastVariant;
  duration?: number;
  className?: string;
}

export function Toast({
  message,
  open,
  onClose,
  severity,
  variant,
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
  const v: ToastVariant = variant ?? severity ?? 'info';
  const role = v === 'error' || v === 'warning' ? 'alert' : 'status';
  return (
    <output
      role={role}
      aria-live="polite"
      data-cir-component="Toast"
      data-severity={v}
      data-variant={v}
      className={cn(displayVariantClass[v], className)}
      style={{ position: 'fixed', right: '16px', bottom: '16px' }}
    >
      {message}
    </output>
  );
}
Toast.displayName = 'Toast';
export function toastTextRender(props: ToastProps): string {
  const v = props.variant ?? props.severity ?? 'info';
  return `[Toast(${v}): ${props.message}]`;
}
export const ToastBinding: ComponentBinding = { id: 'Toast', factory: Toast };
