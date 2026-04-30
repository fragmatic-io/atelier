// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Alert — inline announcement. `variant` is canonical; `severity` is a
 * legacy alias. Wave 6 / P-10: variants info (default), success, warning, error.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, displayVariantClass, type DisplayVariant } from './_variants.js';

export type AlertSeverity = 'info' | 'success' | 'warning' | 'error';
export type AlertVariant = DisplayVariant;

export interface AlertProps {
  severity?: AlertSeverity;
  variant?: AlertVariant;
  title?: string;
  className?: string;
  children?: ReactNode;
}

export function Alert({ severity, variant, title, className, children }: AlertProps): ReactNode {
  const v: AlertVariant = variant ?? severity ?? 'info';
  const role = v === 'error' || v === 'warning' ? 'alert' : 'status';
  return (
    <div
      role={role}
      data-cir-component="Alert"
      data-severity={v}
      data-variant={v}
      className={cn(displayVariantClass[v], className)}
    >
      {title !== undefined ? <strong data-cir-part="alert-title">{title}</strong> : null}
      {children !== undefined ? <div data-cir-part="alert-body">{children}</div> : null}
    </div>
  );
}
Alert.displayName = 'Alert';
export function alertTextRender(props: AlertProps): string {
  const v = props.variant ?? props.severity ?? 'info';
  const head = props.title !== undefined ? `: ${props.title}` : '';
  return `[Alert(${v})${head}]`;
}
export const AlertBinding: ComponentBinding = { id: 'Alert', factory: Alert };
