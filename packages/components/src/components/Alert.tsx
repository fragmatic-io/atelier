// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Alert — inline announcement. `variant` is canonical; `severity` is a
 * legacy alias. Wave 6 / P-10: variants info (default), success, warning, error.
 *
 * Wave 7b (Vis-3): optional `icon` prop renders a leading severity icon
 * (e.g. `info-circle`, `alert-triangle`). Resolved via the host's
 * `IconResolver`; decorative (aria-hidden) since severity is already
 * conveyed by the `role` and the title/body text.
 *
 * Wave 11 / Vis-3 finalisation:
 *   - `icon` accepts a bare string (`<Alert icon="alert-triangle">`) or a
 *     `{ set, name }` bag.
 *   - When `icon` is omitted, a default is auto-derived from the
 *     severity (`info` → `'info'`, `success` → `'circle-check'`,
 *     `warning`/`error` → `'alert-triangle'`). Pass `icon={null}` to
 *     opt out of the default for a bare alert without artwork.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, displayVariantClass, iconSizePx, type DisplayVariant } from './_variants.js';
import { Icon } from './Icon.js';
import { normalizeIconRef, type IconRef } from '../icons/icon-ref.js';

export type AlertSeverity = 'info' | 'success' | 'warning' | 'error';
export type AlertVariant = DisplayVariant;

/**
 * Default lucide icon name per severity. Lined up with names the
 * `LucideIconResolver` default roster recognises out of the box.
 */
const SEVERITY_DEFAULT_ICON: Readonly<Record<AlertSeverity, string>> = Object.freeze({
  info: 'info',
  success: 'circle-check',
  warning: 'alert-triangle',
  error: 'alert-triangle',
});

export interface AlertProps {
  severity?: AlertSeverity;
  variant?: AlertVariant;
  title?: string;
  /**
   * Optional leading icon. Accepts a bare string (resolved against the
   * default `'lucide'` set) or `{ set, name }`. When omitted, the icon
   * defaults to the severity default (see `SEVERITY_DEFAULT_ICON`). Pass
   * `null` to render an alert without any leading icon.
   */
  icon?: IconRef | null;
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
  // Resolve effective icon: explicit `null` opts out, explicit value wins,
  // `undefined` falls through to the severity default.
  const effectiveIcon: IconRef | null =
    icon === null ? null : icon !== undefined ? icon : SEVERITY_DEFAULT_ICON[v];
  return (
    <div
      role={role}
      data-cir-component="Alert"
      data-severity={v}
      data-variant={v}
      className={cn(displayVariantClass[v], className)}
    >
      {effectiveIcon !== null
        ? (() => {
            const ref = normalizeIconRef(effectiveIcon);
            return (
              <span data-cir-part="alert-icon" style={{ marginRight: 8 }}>
                <Icon set={ref.set} name={ref.name} size={iconSizePx.md} />
              </span>
            );
          })()
        : null}
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
