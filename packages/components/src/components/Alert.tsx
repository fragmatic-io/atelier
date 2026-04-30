// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Alert — inline announcement. `variant` is canonical; `severity` is a
 * legacy alias. Wave 6 / P-10: variants info (default), success, warning, error.
 *
 * Wave 7b (Vis-3): optional `icon` prop renders a leading severity icon
 * (e.g. `info-circle`, `alert-triangle`). Resolved via the host's
 * `IconResolver`; decorative (aria-hidden) since severity is already
 * conveyed by the `role` and the title/body text.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, displayVariantClass, iconSizePx, type DisplayVariant } from './_variants.js';
import { Icon } from './Icon.js';

export type AlertSeverity = 'info' | 'success' | 'warning' | 'error';
export type AlertVariant = DisplayVariant;

export interface AlertProps {
  severity?: AlertSeverity;
  variant?: AlertVariant;
  title?: string;
  /** Optional leading icon. Decorative; severity is already conveyed by role + text. */
  icon?: { set: string; name: string };
  className?: string;
  children?: ReactNode;
}

export function Alert({
  severity,
  variant,
  title,
  icon,
  className,
  children,
}: AlertProps): ReactNode {
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
      {icon !== undefined ? (
        <span data-cir-part="alert-icon" style={{ marginRight: 8 }}>
          <Icon set={icon.set} name={icon.name} size={iconSizePx.md} />
        </span>
      ) : null}
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
