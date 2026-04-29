// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Table — semantic `<table>` with a column schema and a row dataset. When
 * `rows` is empty the component renders the `empty` slot (or a default
 * EmptyState) inside the table-equivalent region — never a blank `<tbody>`,
 * which would create a confusing visual gap.
 *
 * Cell content accepts arbitrary `ReactNode` so consumers can embed badges,
 * actions, or other inline components per cell.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { EmptyState } from './EmptyState.js';

export interface TableColumn {
  key: string;
  header: string;
}

export interface TableProps {
  columns: readonly TableColumn[];
  rows: readonly Record<string, ReactNode>[];
  empty?: ReactNode;
  caption?: string;
  className?: string;
}

const DEFAULT_EMPTY = <EmptyState title="No data" />;

export function Table({ columns, rows, empty, caption, className }: TableProps): ReactNode {
  if (rows.length === 0) {
    return (
      <div data-cir-component="Table" data-cir-empty="true" className={className}>
        {empty ?? DEFAULT_EMPTY}
      </div>
    );
  }
  return (
    <table data-cir-component="Table" className={className}>
      {caption !== undefined ? <caption>{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c.key}>{row[c.key] ?? ''}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

Table.displayName = 'Table';

export function tableTextRender(props: TableProps): string {
  return `[Table: ${String(props.columns.length)} cols × ${String(props.rows.length)} rows]`;
}

export const TableBinding: ComponentBinding = {
  id: 'Table',
  factory: Table,
};
