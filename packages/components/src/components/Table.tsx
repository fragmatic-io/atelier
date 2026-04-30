// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Table — semantic <table>. Variants (Wave 6 / P-10): bordered, elevated,
 * ghost (default), tinted.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { EmptyState } from './EmptyState.js';
import { cn, contentVariantClass, type ContentVariant } from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_ROW_PADDING_PX, type Density } from './density.js';

export type TableVariant = ContentVariant;

export interface TableColumn {
  key: string;
  header: string;
}

export interface TableProps {
  columns: readonly TableColumn[];
  rows: readonly Record<string, ReactNode>[];
  empty?: ReactNode;
  caption?: string;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: TableVariant;
  className?: string;
}

const DEFAULT_EMPTY = <EmptyState title="No data" />;

export function Table({
  columns,
  rows,
  empty,
  caption,
  density = DEFAULT_DENSITY,
  variant = 'ghost',
  className,
}: TableProps): ReactNode {
  if (rows.length === 0) {
    return (
      <div
        data-cir-component="Table"
        data-cir-empty="true"
        data-density={density}
        data-variant={variant}
        className={cn(contentVariantClass[variant], className)}
      >
        {empty ?? DEFAULT_EMPTY}
      </div>
    );
  }
  const cellPad = DENSITY_ROW_PADDING_PX[density];
  const cellStyle: CSSProperties = {
    paddingTop: `${String(cellPad)}px`,
    paddingBottom: `${String(cellPad)}px`,
  };
  return (
    <table
      data-cir-component="Table"
      data-density={density}
      data-variant={variant}
      className={cn(contentVariantClass[variant], className)}
    >
      {caption !== undefined ? <caption>{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col" style={cellStyle}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c.key} style={cellStyle}>
                {row[c.key] ?? ''}
              </td>
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
export const TableBinding: ComponentBinding = { id: 'Table', factory: Table };
