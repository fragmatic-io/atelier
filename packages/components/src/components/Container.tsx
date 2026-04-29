// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Container — page-level width-constrained landmark. Renders `<main>` so the
 * accessibility tree picks it up as the document's primary content region.
 *
 * Width tokens cap at common breakpoints. `padding` keeps the inner content
 * away from the edge for touch targets. CSS-free; consumers may override via
 * `className`.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export type ContainerMaxWidth = 'sm' | 'md' | 'lg' | 'full';
export type ContainerPadding = 'none' | 'sm' | 'md';

export interface ContainerProps {
  maxWidth?: ContainerMaxWidth;
  padding?: ContainerPadding;
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
  className,
  children,
}: ContainerProps): ReactNode {
  const style: CSSProperties = {
    maxWidth: CONTAINER_MAX_WIDTH[maxWidth],
    margin: '0 auto',
    padding: PADDING_PX[padding],
    width: '100%',
    boxSizing: 'border-box',
  };
  return (
    <main
      role="main"
      data-cir-component="Container"
      data-max-width={maxWidth}
      data-padding={padding}
      className={className}
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

export const ContainerBinding: ComponentBinding = {
  id: 'Container',
  factory: Container,
};
