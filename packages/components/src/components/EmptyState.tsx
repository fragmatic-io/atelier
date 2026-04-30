// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * EmptyState — semantic placeholder. Variants (Wave 6 / P-10): bordered,
 * elevated, ghost (default), tinted.
 *
 * Wave 7b (Vis-3): optional `icon` prop renders a leading illustration
 * icon. Decorative (aria-hidden) — the title already conveys meaning.
 * Sized at `iconSizePx.xl` for the standard layout (the icon is the
 * "hero" element of an empty state's compact form).
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, contentVariantClass, iconSizePx, type ContentVariant } from './_variants.js';
import { Icon } from './Icon.js';

export type EmptyStateVariant = ContentVariant;

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Optional leading illustration icon. Decorative; meaning is in the title. */
  icon?: { set: string; name: string };
  variant?: EmptyStateVariant;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  variant = 'ghost',
  className,
}: EmptyStateProps): ReactNode {
  return (
    <div
      role="status"
      data-cir-component="EmptyState"
      data-variant={variant}
      className={cn(contentVariantClass[variant], className)}
    >
      {icon !== undefined ? (
        <div data-cir-part="empty-icon" style={{ marginBottom: 8 }}>
          <Icon set={icon.set} name={icon.name} size={iconSizePx.xl} />
        </div>
      ) : null}
      <p data-cir-part="empty-title">{title}</p>
      {description !== undefined ? <p data-cir-part="empty-description">{description}</p> : null}
      {action !== undefined ? <div data-cir-part="empty-action">{action}</div> : null}
    </div>
  );
}
EmptyState.displayName = 'EmptyState';
export function emptyStateTextRender(props: EmptyStateProps): string {
  return props.description !== undefined
    ? `[Empty: ${props.title} — ${props.description}]`
    : `[Empty: ${props.title}]`;
}
export const EmptyStateBinding: ComponentBinding = { id: 'EmptyState', factory: EmptyState };
