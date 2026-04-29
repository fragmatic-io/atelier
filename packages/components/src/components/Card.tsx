// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Card — a bounded content container with an optional header bar (title +
 * actions slot). Renders a `<section>` for accessibility (cards are landmark
 * regions when they carry a heading). The header collapses entirely when
 * neither `title` nor `actions` are provided.
 *
 * Forwards refs so consumers can scroll-into-view, focus, or measure the
 * card from the outside without prop drilling.
 */
import { forwardRef, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface CardProps {
  title?: string;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { title, actions, className, children }: CardProps,
  ref,
): ReactNode {
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <section ref={ref} data-cir-component="Card" className={className} aria-label={title}>
      {hasHeader ? (
        <header data-cir-part="card-header">
          {title !== undefined ? <h3 data-cir-part="card-title">{title}</h3> : null}
          {actions !== undefined ? <div data-cir-part="card-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div data-cir-part="card-body">{children}</div>
    </section>
  );
});

export function cardTextRender(props: CardProps): string {
  return props.title !== undefined ? `[Card: ${props.title}]` : '[Card]';
}

export const CardBinding: ComponentBinding = {
  id: 'Card',
  factory: Card,
};
