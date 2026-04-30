// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Card — bounded content container with optional header.
 * Variants (Wave 6 / P-10): bordered (default), elevated, ghost, tinted.
 */
import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, layoutVariantClass, type LayoutVariant } from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_PADDING_PX, type Density } from './density.js';

export type CardVariant = LayoutVariant;

export interface CardProps {
  title?: string;
  actions?: ReactNode;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: CardVariant;
  className?: string;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    title,
    actions,
    density = DEFAULT_DENSITY,
    variant = 'bordered',
    className,
    children,
  }: CardProps,
  ref,
): ReactNode {
  const hasHeader = title !== undefined || actions !== undefined;
  const padPx = DENSITY_PADDING_PX[density];
  const bodyStyle: CSSProperties = { padding: `${String(padPx)}px` };
  const headerStyle: CSSProperties = {
    padding: `${String(padPx)}px`,
    paddingBottom: `${String(Math.max(0, padPx - 2))}px`,
  };
  return (
    <section
      ref={ref}
      data-cir-component="Card"
      data-density={density}
      data-variant={variant}
      className={cn(layoutVariantClass[variant], className)}
      aria-label={title}
    >
      {hasHeader ? (
        <header data-cir-part="card-header" style={headerStyle}>
          {title !== undefined ? <h3 data-cir-part="card-title">{title}</h3> : null}
          {actions !== undefined ? <div data-cir-part="card-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div data-cir-part="card-body" style={bodyStyle}>
        {children}
      </div>
    </section>
  );
});

export function cardTextRender(props: CardProps): string {
  return props.title !== undefined ? `[Card: ${props.title}]` : '[Card]';
}
export const CardBinding: ComponentBinding = { id: 'Card', factory: Card };
