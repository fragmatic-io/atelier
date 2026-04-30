// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Container — page-level width-constrained <main> landmark.
 * Variants (Wave 6 / P-10): bordered, elevated, ghost (default), tinted.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, layoutVariantClass, type LayoutVariant } from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_PADDING_PX, type Density } from './density.js';

export type ContainerMaxWidth = 'sm' | 'md' | 'lg' | 'full';
export type ContainerPadding = 'none' | 'sm' | 'md';
export type ContainerVariant = LayoutVariant;

export interface ContainerProps {
  maxWidth?: ContainerMaxWidth;
  padding?: ContainerPadding;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: ContainerVariant;
  className?: string;
  children?: ReactNode;
}

export const CONTAINER_MAX_WIDTH: Readonly<Record<ContainerMaxWidth, string>> = Object.freeze({
  sm: '640px',
  md: '960px',
  lg: '1280px',
  full: '100%',
});
const PADDING_PX: Readonly<Record<ContainerPadding, string>> = Object.freeze({
  none: '0',
  sm: '8px',
  md: '16px',
});

export function Container({
  maxWidth = 'md',
  padding = 'md',
  density = DEFAULT_DENSITY,
  variant = 'ghost',
  className,
  children,
}: ContainerProps): ReactNode {
  const densityPad = DENSITY_PADDING_PX[density];
  const horizontalPad = PADDING_PX[padding];
  const style: CSSProperties = {
    maxWidth: CONTAINER_MAX_WIDTH[maxWidth],
    margin: '0 auto',
    padding: `${String(densityPad)}px ${horizontalPad}`,
    width: '100%',
    boxSizing: 'border-box',
  };
  return (
    <main
      role="main"
      data-cir-component="Container"
      data-max-width={maxWidth}
      data-padding={padding}
      data-density={density}
      data-variant={variant}
      className={cn(layoutVariantClass[variant], className)}
      style={style}
    >
      {children}
    </main>
  );
}
Container.displayName = 'Container';
export function containerTextRender(props: ContainerProps): string {
  return `[Container ${props.maxWidth ?? 'md'}]`;
}
export const ContainerBinding: ComponentBinding = { id: 'Container', factory: Container };
