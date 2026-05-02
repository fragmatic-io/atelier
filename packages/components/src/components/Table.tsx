// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Table — semantic <table>. Variants (Wave 6 / P-10): bordered, elevated,
 * ghost (default), tinted.
 *
 * Wave 7b / Nav-3 — sticky pinned rows. A row record with `pinned: true`
 * floats above unpinned rows, sticks to the top of the scroll container via
 * `position: sticky`, and gets a small Unicode pin glyph in the first cell.
 * A faint separator <tr> divides the pinned block from the unpinned tail
 * (toggle via `showPinnedSeparator`). React keys are derived from the row's
 * index in the SOURCE array so reconciliation is stable across pin/unpin.
 *
 * Wave 7b / Int-9 — opt-in multi-select. When `selectable` is true, the
 * Table prepends a checkbox cell to each row and reflects `data-selected`
 * based on `selectedIds`. Click toggles, Shift+Click range-selects between
 * the last clicked anchor and the new row. The header gets a "select-all"
 * checkbox in that same first column — checked when every visible row is
 * selected, indeterminate when only some are. With `bulkActions`, a
 * floating `<BulkActionBar>` auto-mounts at bottom-center while the
 * selection is non-empty.
 *
 * Wave 7 / P-8 (closing) — Table renders the populated case only. Loading /
 * error / empty are walker-side substitutions: the manifest declares
 * `data.loading_state` / `data.error_state` / `data.empty_state` and the
 * `<RenderNode>` walker swaps the slot in before constructing this component
 * (or falls through to `BASELINE_RESOLVER_DEFAULTS` when no slot is declared).
 * Hosts that need direct host-side React composition compose `<Skeleton>` /
 * `<Alert>` / `<EmptyState>` themselves.
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { BulkActionBar, type BulkAction } from './BulkActionBar.js';
import {
  cn,
  contentVariantClass,
  pinnedSeparatorClass,
  type ContentVariant,
  type PinnedSeparatorVariant,
} from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_ROW_PADDING_PX, type Density } from './density.js';

export type TableVariant = ContentVariant;

/** Unicode pushpin used as the default pinned-row indicator. */
const PIN_GLYPH = '\u{1F4CC}';
const PINNED_KEY = 'pinned';

export interface TableColumn {
  key: string;
  header: string;
  /**
   * Wave 11 / Vis-1 — when `true`, cells in this column emit
   * `data-tnum="true"`. Hosts whose brand kit declares
   * `tokens.typography.opentype.tabular_numerals: true` activate
   * `font-variant-numeric: tabular-nums` on these cells via a single CSS
   * rule (see `apps/demo/app/globals.css` for the worked example). When the
   * brand kit does not declare the flag, the marker is inert.
   */
  numeric?: boolean;
  /** Optional cell alignment. Cells get `text-align: <align>` when set. */
  align?: 'left' | 'right' | 'center';
}

export type TableRowSpec = Record<string, ReactNode> & {
  /**
   * Wave 7b / Nav-3. When true, this row floats to the top of the rendered
   * table (above unpinned rows, in source order) and sticks during scroll.
   */
  pinned?: boolean;
};

export interface TableProps {
  /**
   * Column descriptors. Required for the default cell renderer; with a
   * `renderItem` row factory the columns may be empty (the factory owns
   * the row's `<td>` layout).
   */
  columns?: readonly TableColumn[];
  /** Tabular row specs. Required unless `data` (manifest-driven) is supplied. */
  rows?: readonly TableRowSpec[];
  /**
   * Manifest-friendly alias for `rows`. When the manifest renderer resolves
   * a `data` binding it threads the resolved array as `data`. Explicit
   * `rows` wins; otherwise we accept `data` if it is array-shaped. Mirrors
   * the same fallback `<List>` ships (Phase 2 #3).
   */
  data?: unknown;
  /**
   * Per-row factory. When supplied, the Table renders one `<tr>` per row
   * by calling `renderItem(row, index)` instead of the column-mapped
   * default. The runtime adapter populates this from `LayoutNode.row_binding`
   * (Phase 2 #3) — the resolved binding's factory receives the row item as
   * `props.data`. Hosts can also pass an explicit closure.
   */
  renderItem?: (row: TableRowSpec, index: number) => ReactNode;
  caption?: string;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: TableVariant;
  className?: string;
  /**
   * Render a faint divider row between the pinned block and the unpinned
   * tail. Defaults to `true`.
   */
  showPinnedSeparator?: boolean;
  /** Visual variant of the pinned-block separator. */
  pinnedSeparatorVariant?: PinnedSeparatorVariant;
  /** Override the `aria-label` applied to every pinned `<tr>`. */
  pinAriaLabel?: (row: TableRowSpec) => string;
  /**
   * Wave 7b / Int-9 — opt-in multi-select. When true, every row gets a
   * leading checkbox cell.
   */
  selectable?: boolean;
  /** Stable id extractor used to key rows into `selectedIds`. Defaults to the row index as a string. */
  idOf?: (row: TableRowSpec, index: number) => string;
  /** Read-only set of currently-selected ids. Only consulted when `selectable` is true. */
  selectedIds?: ReadonlySet<string>;
  /** Called whenever the selection set changes. Hosts pass an immutable next-state. */
  onSelectionChange?: (next: ReadonlySet<string>) => void;
  /** Bulk actions surfaced via `<BulkActionBar>` when one or more rows are selected. */
  bulkActions?: readonly BulkAction[];
  /** Click handler for a bulk action. Receives the action's id (= capability id). */
  onBulkAction?: (actionId: string) => void;
}

function isPinnedRow(row: TableRowSpec): boolean {
  return row[PINNED_KEY] === true;
}

export function Table({
  columns: columnsProp,
  rows: rowsProp,
  data,
  renderItem,
  caption,
  density = DEFAULT_DENSITY,
  variant = 'ghost',
  className,
  showPinnedSeparator = true,
  pinnedSeparatorVariant = 'default',
  pinAriaLabel,
  selectable = false,
  idOf,
  selectedIds,
  onSelectionChange,
  bulkActions,
  onBulkAction,
}: TableProps): ReactNode {
  const anchorRef = useRef<string | null>(null);
  const [localSelected, setLocalSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
  // Resolve rows: explicit `rows` wins; else accept `data` if array-shaped
  // (the manifest renderer threads resolved data through `data` when a
  // `row_binding` is set on the node).
  const rows: readonly TableRowSpec[] =
    rowsProp ?? (Array.isArray(data) ? (data as readonly TableRowSpec[]) : []);
  const columns: readonly TableColumn[] = columnsProp ?? [];
  // Wave 7 / P-8 (closing) — Table no longer hand-rolls an empty branch; the
  // walker substitutes `data.empty_state` (or `BASELINE_RESOLVER_DEFAULTS.empty`)
  // before this component is constructed. With no rows we still render the
  // populated <table> shell (header + empty <tbody>) so the component never
  // crashes when used outside the walker.
  const cellPad = DENSITY_ROW_PADDING_PX[density];
  const cellStyle: CSSProperties = {
    paddingTop: `${String(cellPad)}px`,
    paddingBottom: `${String(cellPad)}px`,
  };
  // Sticky <tr> styling. Inline so non-Tailwind hosts get the behaviour with
  // no CSS-config surgery. `position: sticky` on a `<tr>` is well-supported
  // in modern engines once the cells also carry `position: sticky`.
  const pinnedCellStyle: CSSProperties = {
    ...cellStyle,
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: 'inherit',
  };
  const indexed = rows.map((row, i) => ({ row, i }));
  const pinnedRows = indexed.filter(({ row }) => isPinnedRow(row));
  const unpinnedRows = indexed.filter(({ row }) => !isPinnedRow(row));
  const hasPinned = pinnedRows.length > 0;

  // Selection wiring (mirrors List).
  const idResolver = idOf ?? ((_row: TableRowSpec, index: number): string => String(index));
  const effectiveSelected = selectedIds ?? localSelected;
  const allIds = rows.map((row, i) => idResolver(row, i));
  const emitSelection = (next: ReadonlySet<string>): void => {
    if (onSelectionChange) onSelectionChange(next);
    else setLocalSelected(next);
  };
  const handleToggle = (id: string, e: React.MouseEvent | React.ChangeEvent): void => {
    const isShiftClick =
      'shiftKey' in (e as unknown as { shiftKey?: boolean }) &&
      (e as unknown as { shiftKey?: boolean }).shiftKey === true;
    const next = new Set<string>(effectiveSelected);
    if (isShiftClick && anchorRef.current && anchorRef.current !== id) {
      const fromIdx = allIds.indexOf(anchorRef.current);
      const toIdx = allIds.indexOf(id);
      if (fromIdx !== -1 && toIdx !== -1) {
        const lo = Math.min(fromIdx, toIdx);
        const hi = Math.max(fromIdx, toIdx);
        for (let k = lo; k <= hi; k++) {
          const cur = allIds[k];
          if (cur !== undefined) next.add(cur);
        }
        emitSelection(next);
        return;
      }
    }
    if (next.has(id)) next.delete(id);
    else next.add(id);
    anchorRef.current = id;
    emitSelection(next);
  };
  const handleClear = (): void => {
    anchorRef.current = null;
    emitSelection(new Set<string>());
  };

  // Select-all checkbox in the header — checked when every visible row is in
  // the selection set, indeterminate when some-but-not-all are selected. The
  // `ref` callback writes the indeterminate flag because it is not a React
  // prop. Click toggles between "all rows" and "no rows".
  const allSelected =
    selectable && allIds.length > 0 && allIds.every((id) => effectiveSelected.has(id));
  const someSelected = selectable && !allSelected && allIds.some((id) => effectiveSelected.has(id));
  const handleSelectAll = (): void => {
    if (allSelected) {
      anchorRef.current = null;
      emitSelection(new Set<string>());
    } else {
      anchorRef.current = null;
      emitSelection(new Set<string>(allIds));
    }
  };
  const checkboxHeader = selectable ? (
    <th key="cir-select" scope="col" style={cellStyle} data-cir-part="table-select-header">
      <input
        type="checkbox"
        data-cir-part="table-select-all"
        aria-label="Select all rows"
        checked={allSelected}
        ref={(node): void => {
          if (node) node.indeterminate = someSelected;
        }}
        onChange={handleSelectAll}
      />
    </th>
  ) : null;
  const checkboxCell = (id: string, idx: number, style: CSSProperties): ReactNode => {
    const checked = effectiveSelected.has(id);
    return (
      <td key="cir-select" style={style} data-cir-part="table-select-cell">
        <input
          type="checkbox"
          aria-label={`Select row ${String(idx + 1)}`}
          checked={checked}
          onClick={(e): void => {
            handleToggle(id, e);
          }}
          onChange={(): void => {
            /* handled via onClick to access shiftKey */
          }}
        />
      </td>
    );
  };

  const table = (
    <table
      data-cir-component="Table"
      data-density={density}
      data-variant={variant}
      data-has-pinned={hasPinned ? 'true' : 'false'}
      data-selectable={selectable ? 'true' : 'false'}
      className={cn(contentVariantClass[variant], className)}
    >
      {caption !== undefined ? <caption>{caption}</caption> : null}
      <thead>
        <tr>
          {checkboxHeader}
          {columns.map((c) => {
            const headerStyle: CSSProperties = c.align
              ? { ...cellStyle, textAlign: c.align }
              : cellStyle;
            return (
              <th
                key={c.key}
                scope="col"
                style={headerStyle}
                data-tnum={c.numeric === true ? 'true' : undefined}
              >
                {c.header}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {pinnedRows.map(({ row, i }) => {
          const ariaLabel = pinAriaLabel ? pinAriaLabel(row) : 'Pinned';
          const id = idResolver(row, i);
          const checked = selectable && effectiveSelected.has(id);
          return (
            <tr
              key={i}
              data-pinned="true"
              data-selected={selectable ? (checked ? 'true' : 'false') : undefined}
              aria-label={ariaLabel}
            >
              {selectable ? checkboxCell(id, i, pinnedCellStyle) : null}
              {renderItem ? (
                <td
                  key="cir-row-factory"
                  colSpan={Math.max(columns.length, 1)}
                  style={pinnedCellStyle}
                >
                  <span data-pin-indicator="true" aria-hidden="true">
                    {PIN_GLYPH}{' '}
                  </span>
                  {renderItem(row, i)}
                </td>
              ) : (
                columns.map((c, ci) => {
                  const colStyle: CSSProperties = c.align
                    ? { ...pinnedCellStyle, textAlign: c.align }
                    : pinnedCellStyle;
                  return (
                    <td
                      key={c.key}
                      style={colStyle}
                      data-tnum={c.numeric === true ? 'true' : undefined}
                    >
                      {ci === 0 ? (
                        <span data-pin-indicator="true" aria-hidden="true">
                          {PIN_GLYPH}{' '}
                        </span>
                      ) : null}
                      {row[c.key] ?? ''}
                    </td>
                  );
                })
              )}
            </tr>
          );
        })}
        {hasPinned && showPinnedSeparator ? (
          <tr key="cir-pinned-separator" aria-hidden="true" data-cir-part="pinned-separator">
            <td
              colSpan={Math.max(columns.length, 1) + (selectable ? 1 : 0)}
              className={pinnedSeparatorClass[pinnedSeparatorVariant]}
              style={{ padding: 0, height: 0 }}
            />
          </tr>
        ) : null}
        {unpinnedRows.map(({ row, i }) => {
          const id = idResolver(row, i);
          const checked = selectable && effectiveSelected.has(id);
          return (
            <tr key={i} data-selected={selectable ? (checked ? 'true' : 'false') : undefined}>
              {selectable ? checkboxCell(id, i, cellStyle) : null}
              {renderItem ? (
                <td
                  key="cir-row-factory"
                  colSpan={Math.max(columns.length, 1)}
                  style={cellStyle}
                  data-cir-part="table-row-factory"
                >
                  {renderItem(row, i)}
                </td>
              ) : (
                columns.map((c) => {
                  const colStyle: CSSProperties = c.align
                    ? { ...cellStyle, textAlign: c.align }
                    : cellStyle;
                  return (
                    <td
                      key={c.key}
                      style={colStyle}
                      data-tnum={c.numeric === true ? 'true' : undefined}
                    >
                      {row[c.key] ?? ''}
                    </td>
                  );
                })
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const showBar =
    selectable &&
    bulkActions !== undefined &&
    bulkActions.length > 0 &&
    effectiveSelected.size >= 1;
  if (!showBar) return table;
  return (
    <>
      {table}
      <BulkActionBar
        selectionCount={effectiveSelected.size}
        actions={bulkActions}
        onAction={(id): void => {
          if (onBulkAction) onBulkAction(id);
        }}
        onClear={handleClear}
      />
    </>
  );
}
Table.displayName = 'Table';
export function tableTextRender(props: TableProps): string {
  const cols = props.columns?.length ?? 0;
  const rows =
    props.rows?.length ?? (Array.isArray(props.data) ? (props.data as unknown[]).length : 0);
  return `[Table: ${String(cols)} cols × ${String(rows)} rows]`;
}
export const TableBinding: ComponentBinding = { id: 'Table', factory: Table };
