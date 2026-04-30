// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * List — generic semantic <ul>. Variants (Wave 6 / P-10): bordered,
 * elevated, ghost (default), tinted.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, contentVariantClass, type ContentVariant } from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_ROW_PADDING_PX, type Density } from './density.js';

export type ListVariant = ContentVariant;

export interface ListProps<T> {
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  empty?: ReactNode;
  bordered?: boolean;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: ListVariant;
  className?: string;
}

export function List<T>({
  items,
  renderItem,
  empty,
  bordered,
  density = DEFAULT_DENSITY,
  variant = 'ghost',
  className,
}: ListProps<T>): ReactNode {
  if (items.length === 0) {
    return (
      <div
        data-cir-component="List"
        data-cir-empty="true"
        data-density={density}
        data-variant={variant}
        className={cn(contentVariantClass[variant], className)}
      >
        {empty ?? null}
      </div>
    );
  }
  const rowPad = DENSITY_ROW_PADDING_PX[density];
  const itemStyle: CSSProperties = {
    paddingTop: `${String(rowPad)}px`,
    paddingBottom: `${String(rowPad)}px`,
  };
  return (
    <ul
      data-cir-component="List"
      data-bordered={bordered ? 'true' : 'false'}
      data-density={density}
      data-variant={variant}
      className={cn(contentVariantClass[variant], className)}
    >
      {items.map((item, i) => (
        <li key={i} data-cir-part="list-item" style={itemStyle}>
          {renderItem(item, i)}
        </li>
      ))}
    </ul>
  );
}
List.displayName = 'List';
export function listTextRender(props: ListProps<unknown>): string {
  return `[List: ${String(props.items.length)} items]`;
}
export const ListBinding: ComponentBinding = {
  id: 'List',
  factory: List as ComponentBinding['factory'],
};
