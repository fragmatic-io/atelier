// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Alert — inline announcement. `severity` maps to `data-severity` for styling
 * and to an appropriate ARIA role:
 *  - `error` / `warning` → `role="alert"` (assertive announcement)
 *  - `info` / `success` → `role="status"` (polite announcement)
 *
 * We don't use `aria-live` directly; the role implies the right live-region
 * politeness for screen readers.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export type AlertSeverity = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  severity: AlertSeverity;
  title?: string;
  className?: string;
  children?: ReactNode;
}

export function Alert({ severity, title, className, children }: AlertProps): ReactNode {
  const role = severity === 'error' || severity === 'warning' ? 'alert' : 'status';
  return (
    <div role={role} data-cir-component="Alert" data-severity={severity} className={className}>
      {title !== undefined ? <strong data-cir-part="alert-title">{title}</strong> : null}
      {children !== undefined ? <div data-cir-part="alert-body">{children}</div> : null}
    </div>
  );
}

Alert.displayName = 'Alert';

export function alertTextRender(props: AlertProps): string {
  const head = props.title !== undefined ? `: ${props.title}` : '';
  return `[Alert(${props.severity})${head}]`;
}

export const AlertBinding: ComponentBinding = {
  id: 'Alert',
  factory: Alert,
};
