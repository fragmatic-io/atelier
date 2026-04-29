// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * EmptyState — semantic "nothing to show here" placeholder used by Table,
 * lists, and any data-driven container. Rendered as `<div role="status">`
 * so assistive tech announces it as a status update when it appears.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps): ReactNode {
  return (
    <div role="status" data-cir-component="EmptyState" className={className}>
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

export const EmptyStateBinding: ComponentBinding = {
  id: 'EmptyState',
  factory: EmptyState,
};
