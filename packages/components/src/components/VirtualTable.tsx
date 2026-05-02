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
 */
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ComponentBinding } from '@atelier/runtime';
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
}: VirtualTableProps): ReactNode {
  const rows: readonly TableRowSpec[] =
    rowsProp ?? (Array.isArray(data) ? (data as readonly TableRowSpec[]) : []);

  const parentRef = useRef<HTMLDivElement>(null);
  const fetchMoreInFlight = useRef(false);
  const fetchPrevInFlight = useRef(false);

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
  const gridTemplate = columns.map(() => 'minmax(0, 1fr)').join(' ');
  const cellStyle: CSSProperties = {
    paddingTop: `${String(cellPad)}px`,
    paddingBottom: `${String(cellPad)}px`,
    paddingLeft: '8px',
    paddingRight: '8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      data-cir-component="VirtualTable"
      data-density={density}
      data-variant={variant}
      data-virtual="true"
      data-row-count={String(rows.length)}
      data-total={total !== undefined ? String(total) : undefined}
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
            return (
              <div
                key={virtualRow.key}
                role="row"
                data-cir-part="virtual-table-row"
                data-index={String(virtualRow.index)}
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
