// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * EmptyState — semantic placeholder. Variants (Wave 6 / P-10): bordered,
 * elevated, ghost (default), tinted.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, contentVariantClass, type ContentVariant } from './_variants.js';

export type EmptyStateVariant = ContentVariant;

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: EmptyStateVariant;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
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
