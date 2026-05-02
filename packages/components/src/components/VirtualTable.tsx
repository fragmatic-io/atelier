// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * VirtualTable — virtualized variant of `<Table>` for high-cardinality
 * tabular data (Wave 10 / S-2).
 *
 * Same role for `<Table>` as `<VirtualList>` is for `<List>`. Mirrors the
 * `<Table>` API surface (columns, rows, density, variant) so manifests can
 * swap the binding id with minimal churn. Implementation uses
 * `@tanstack/react-virtual` to render only viewport rows (plus an
 * overscan buffer) and emits `onFetchMore` / `onFetchPrev` callbacks at the
 * scroll edges so hosts can drive cursor-based page loading.
 *
 * Layout note: a virtualized `<table>` is finicky — `position: sticky` rows
 * in a `<tbody>` interact poorly with absolute-positioning. We therefore
 * build the surface as a **CSS-grid table** (header row + body grid). The
 * resulting DOM is `<div data-cir-component="VirtualTable">` containing a
 * grid header `<div role="row">` and a virtualized body. Hosts that need a
 * literal semantic `<table>` should keep using `<Table>` for short data;
 * `<VirtualTable>` is for the >500-row case where DOM count matters more
 * than literal table semantics. ARIA role attributes (`grid` / `row` /
 * `gridcell`) preserve assistive-tech semantics.
 *
 * Wave 11 / Int-9 — multi-select. Mirrors the `<Table>` shape: when
 * `selectable` is true, prepends a 40px-track checkbox column to the grid
 * (header gets a select-all checkbox; each viewport row gets its own).
 * Range-select via Shift+Click resolves indices against the FULL `rows`
 * sequence so the swath survives scrolling. Auto-mounts a `<BulkActionBar>`
 * when `bulkActions` is supplied AND the selection is non-empty.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ComponentBinding } from '@atelier/runtime';
import { BulkActionBar, type BulkAction } from './BulkActionBar.js';
import { cn, contentVariantClass, type ContentVariant } from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_ROW_PADDING_PX, type Density } from './density.js';
import type { TableColumn, TableRowSpec } from './Table.js';

export type VirtualTableVariant = ContentVariant;

/** Default per-row height estimate (px). */
export const VIRTUAL_TABLE_DEFAULT_ESTIMATE = 44;
/** Default overscan buffer above + below the viewport (px). */
export const VIRTUAL_TABLE_DEFAULT_OVERSCAN = 200;

export interface VirtualTableProps {
  /** Column descriptors. Same shape as `<Table>`. */
  columns: readonly TableColumn[];
  /**
   * Pre-fetched rows so far. Component drives the next-page fetch via
   * onFetchMore. Optional when `data` is supplied (the manifest renderer
   * threads resolved data here, mirroring `<Table>`).
   */
  rows?: readonly TableRowSpec[];
  /**
   * Manifest-friendly alias for `rows`. The manifest renderer threads
   * resolved data here when no explicit `rows` is set (mirrors `<Table>`).
   */
  data?: unknown;
  /** Total row count when known; else use cursor-driven loading. */
  total?: number;
  /** Estimated row height in px (for scrollbar accuracy). Defaults to 44. */
  estimateSize?: number;
  /** Visible buffer in px above + below the viewport. Defaults to 200. */
  overscan?: number;
  /** Called when the user scrolls within `overscan` of the bottom. */
  onFetchMore?: () => Promise<void> | void;
  /** Called when the user scrolls within `overscan` of the top. */
  onFetchPrev?: () => Promise<void> | void;
  /** Per-row factory. When supplied, the row body is rendered by the factory. */
  renderItem?: (row: TableRowSpec, index: number) => ReactNode;
  caption?: string;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: VirtualTableVariant;
  className?: string;
  /**
   * Height of the scroll viewport in px. Defaults to 480 (≈11 rows at the
   * default estimate).
   */
  viewportHeight?: number | string;
  /**
   * Wave 11 / Int-9 — opt-in multi-select. When true, every row gets a
   * leading checkbox cell. Mirrors `<Table>`'s shape exactly so manifests
   * can swap the binding id with no other prop churn.
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

export function VirtualTable({
  columns,
  rows: rowsProp,
  data,
  total,
  estimateSize = VIRTUAL_TABLE_DEFAULT_ESTIMATE,
  overscan = VIRTUAL_TABLE_DEFAULT_OVERSCAN,
  onFetchMore,
  onFetchPrev,
  renderItem,
  caption,
  density = DEFAULT_DENSITY,
  variant = 'ghost',
  className,
  viewportHeight = 480,
  selectable = false,
  idOf,
  selectedIds,
  onSelectionChange,
  bulkActions,
  onBulkAction,
}: VirtualTableProps): ReactNode {
  const rows: readonly TableRowSpec[] =
    rowsProp ?? (Array.isArray(data) ? (data as readonly TableRowSpec[]) : []);

  const parentRef = useRef<HTMLDivElement>(null);
  const fetchMoreInFlight = useRef(false);
  const fetchPrevInFlight = useRef(false);

  // Wave 11 / Int-9 — multi-select wiring. Mirrors `<Table>` (range-select
  // resolves against the full `rows` sequence, not just the viewport).
  const idResolver = idOf ?? ((_row: TableRowSpec, index: number): string => String(index));
  const anchorRef = useRef<string | null>(null);
  const [localSelected, setLocalSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
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

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: Math.max(1, Math.ceil(overscan / Math.max(1, estimateSize))),
  });

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    if (
      onFetchMore &&
      !fetchMoreInFlight.current &&
      distanceFromBottom <= overscan &&
      (total === undefined || rows.length < total)
    ) {
      fetchMoreInFlight.current = true;
      void Promise.resolve(onFetchMore()).finally(() => {
        fetchMoreInFlight.current = false;
      });
    }

    if (onFetchPrev && !fetchPrevInFlight.current && scrollTop <= overscan && scrollTop > 0) {
      fetchPrevInFlight.current = true;
      void Promise.resolve(onFetchPrev()).finally(() => {
        fetchPrevInFlight.current = false;
      });
    }
  }, [onFetchMore, onFetchPrev, overscan, rows.length, total]);

  useEffect(() => {
    fetchMoreInFlight.current = false;
    fetchPrevInFlight.current = false;
  }, [rows.length]);

  const cellPad = DENSITY_ROW_PADDING_PX[density];
  // Equal-share columns; hosts can override via `className` on the wrapper.
  // When `selectable`, prepend a fixed-width checkbox column so the toggles
  // line up regardless of how many data columns are present.
  const checkboxTrack = selectable ? '40px ' : '';
  const gridTemplate = checkboxTrack + columns.map(() => 'minmax(0, 1fr)').join(' ');
  const cellStyle: CSSProperties = {
    paddingTop: `${String(cellPad)}px`,
    paddingBottom: `${String(cellPad)}px`,
    paddingLeft: '8px',
    paddingRight: '8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  // Wave 11 / Int-9 — header select-all + per-row checkbox cell. Mirrors
  // `<Table>` exactly: checked when every row is selected, indeterminate
  // when only some are, click toggles between "all" and "none".
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

  const grid = (
    <div
      data-cir-component="VirtualTable"
      data-density={density}
      data-cir-density={density}
      data-variant={variant}
      data-virtual="true"
      data-row-count={String(rows.length)}
      data-total={total !== undefined ? String(total) : undefined}
      data-selectable={selectable ? 'true' : 'false'}
      role="grid"
      aria-rowcount={total ?? rows.length}
      className={cn(contentVariantClass[variant], className)}
    >
      {caption !== undefined ? (
        <div data-cir-part="virtual-table-caption" role="caption">
          {caption}
        </div>
      ) : null}
      <div
        data-cir-part="virtual-table-header"
        role="row"
        style={{
          display: 'grid',
          gridTemplateColumns: gridTemplate,
          fontWeight: 600,
        }}
      >
        {selectable ? (
          <div role="columnheader" data-cir-part="virtual-table-select-header" style={cellStyle}>
            <input
              type="checkbox"
              data-cir-part="virtual-table-select-all"
              aria-label="Select all rows"
              checked={allSelected}
              ref={(node): void => {
                if (node) node.indeterminate = someSelected;
              }}
              onChange={handleSelectAll}
            />
          </div>
        ) : null}
        {columns.map((c) => {
          const headerStyle: CSSProperties = c.align
            ? { ...cellStyle, textAlign: c.align }
            : cellStyle;
          return (
            <div
              key={c.key}
              role="columnheader"
              data-tnum={c.numeric === true ? 'true' : undefined}
              style={headerStyle}
            >
              {c.header}
            </div>
          );
        })}
      </div>
      <div
        ref={parentRef}
        data-cir-part="virtual-table-scroll"
        onScroll={handleScroll}
        style={{
          height:
            typeof viewportHeight === 'number' ? `${String(viewportHeight)}px` : viewportHeight,
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <div
          data-cir-part="virtual-table-spacer"
          style={{
            height: `${String(rowVirtualizer.getTotalSize())}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index] as TableRowSpec;
            const id = idResolver(row, virtualRow.index);
            const checked = selectable && effectiveSelected.has(id);
            return (
              <div
                key={virtualRow.key}
                role="row"
                data-cir-part="virtual-table-row"
                data-index={String(virtualRow.index)}
                data-selected={selectable ? (checked ? 'true' : 'false') : undefined}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${String(virtualRow.start)}px)`,
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                }}
              >
                {selectable ? (
                  <div role="gridcell" data-cir-part="virtual-table-select-cell" style={cellStyle}>
                    <input
                      type="checkbox"
                      aria-label={`Select row ${String(virtualRow.index + 1)}`}
                      checked={checked}
                      onClick={(e): void => {
                        handleToggle(id, e);
                      }}
                      onChange={(): void => {
                        /* handled via onClick to access shiftKey */
                      }}
                    />
                  </div>
                ) : null}
                {renderItem
                  ? renderItem(row, virtualRow.index)
                  : columns.map((c) => {
                      const colStyle: CSSProperties = c.align
                        ? { ...cellStyle, textAlign: c.align }
                        : cellStyle;
                      return (
                        <div
                          key={c.key}
                          role="gridcell"
                          style={colStyle}
                          data-tnum={c.numeric === true ? 'true' : undefined}
                        >
                          {row[c.key] ?? ''}
                        </div>
                      );
                    })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Wave 11 / Int-9 — auto-mount the floating bar when selection non-empty
  // and `bulkActions` declared.
  const showBar =
    selectable &&
    bulkActions !== undefined &&
    bulkActions.length > 0 &&
    effectiveSelected.size >= 1;
  if (!showBar) return grid;
  return (
    <>
      {grid}
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
VirtualTable.displayName = 'VirtualTable';

export function virtualTableTextRender(props: VirtualTableProps): string {
  const cols = props.columns?.length ?? 0;
  const len =
    props.rows?.length ?? (Array.isArray(props.data) ? (props.data as unknown[]).length : 0);
  const totalSuffix = props.total !== undefined ? ` of ${String(props.total)}` : '';
  return `[VirtualTable: ${String(cols)} cols × ${String(len)}${totalSuffix} rows]`;
}

export const VirtualTableBinding: ComponentBinding = {
  id: 'VirtualTable',
  factory: VirtualTable as ComponentBinding['factory'],
  manifestContract: {
    description:
      'Virtualized variant of <Table> for high-cardinality tabular data (Wave 10 / S-2). Mirrors the <Table> contract (columns + rows / data + optional renderItem) and adds cursor-driven loading: onFetchMore fires when the user scrolls within `overscan` of the bottom. Renders as a CSS-grid table (role="grid"/"row"/"gridcell") rather than a literal <table> to make virtualization work cleanly. Composition rule: forced when capability `expected_count > 500`.',
    allowed_props: {
      columns: 'array',
      rows: 'array',
      data: 'unknown',
      renderItem: 'function',
      caption: 'string',
      density: 'string',
      variant: 'string',
      selectable: 'boolean',
      idOf: 'function',
      selectedIds: 'object',
      onSelectionChange: 'function',
      bulkActions: 'array',
      onBulkAction: 'function',
      className: 'string',
      total: 'number',
      estimateSize: 'number',
      overscan: 'number',
      onFetchMore: 'function',
      onFetchPrev: 'function',
      viewportHeight: 'unknown',
    },
  },
};
