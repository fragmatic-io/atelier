// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * List — generic semantic `<ul>` that walks `items` through `renderItem`.
 * When `items` is empty the `empty` slot is rendered in place of the list,
 * matching the same "never render an empty container" rule Table uses.
 *
 * Generic over the item shape so callers keep type safety on the render
 * callback. `bordered` is a presentational hint surfaced as a data attr.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface ListProps<T> {
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  empty?: ReactNode;
  bordered?: boolean;
  className?: string;
}

export function List<T>({
  items,
  renderItem,
  empty,
  bordered,
  className,
}: ListProps<T>): ReactNode {
  if (items.length === 0) {
    return (
      <div data-cir-component="List" data-cir-empty="true" className={className}>
        {empty ?? null}
      </div>
    );
  }
  return (
    <ul data-cir-component="List" data-bordered={bordered ? 'true' : 'false'} className={className}>
      {items.map((item, i) => (
        <li key={i} data-cir-part="list-item">
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
