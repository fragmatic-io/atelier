// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * VirtualList — virtualized variant of `<List>` for high-cardinality data
 * (Wave 10 / S-2). Renders only the rows in the viewport (plus an
 * overscan buffer) and emits `onFetchMore` / `onFetchPrev` callbacks when
 * the user scrolls within `overscan` of an edge.
 *
 * The component is **headless on the data side**: hosts pre-fetch the items
 * already in `items` and drive the next-page fetch via `onFetchMore`. This
 * keeps `<VirtualList>` agnostic to the underlying transport (REST,
 * GraphQL, fixture, etc.) and pairs naturally with the cursor pagination
 * protocol on `DataResolver` (`paginate` / `CursorPaginatedResult`).
 *
 * API surface intentionally mirrors `<List>` so manifests can swap the
 * binding id with minimal churn:
 *
 *   - `items` / `data` — same fallback semantics as `<List>` (explicit
 *     `items` wins; falls back to a resolver-supplied `data` array).
 *   - `renderItem` — same shape; default reaches for a sensible label.
 *   - `bordered` / `density` / `variant` / `className` — identical.
 *
 * Distinct surface area:
 *   - `data-cir-component="VirtualList"` (vs `"List"`) so policies and
 *     CSS hooks differ. Hosts that want the virtual variant to look
 *     identical can mirror their `[data-cir-component="List"]` rules.
 *   - `total` — when known, used to compute scrollbar position and detect
 *     "all loaded".
 *   - `estimateSize` — px estimate per row for `useVirtualizer`. Defaults
 *     to 48 (the same per-row rhythm a comfortable `<List>` ships).
 *   - `overscan` — px buffer above + below the viewport for smooth scroll
 *     and edge-trigger thresholds. Defaults to 200.
 *   - `onFetchMore` / `onFetchPrev` — fire once per edge crossing. The
 *     component dedupes concurrent calls via an internal flag.
 *
 * Wave 11 / Int-9 — multi-select. Mirrors the `<List>` shape:
 * `selectable` renders a leading checkbox per visible row, click toggles,
 * Shift+Click range-selects against the FULL `items` sequence (not just
 * the viewport) so the swath survives scrolling. Auto-mounts a
 * `<BulkActionBar>` via portal when `bulkActions` is supplied AND the
 * selection is non-empty.
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
import { BulkActionBar } from './BulkActionBar.js';
import { cn, contentVariantClass, type ContentVariant } from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_ROW_PADDING_PX } from './density.js';
import type { ListProps } from './List.js';

export type VirtualListVariant = ContentVariant;

/** Default per-row height estimate for the virtualizer (px). */
export const VIRTUAL_LIST_DEFAULT_ESTIMATE = 48;
/** Default overscan buffer above + below the viewport (px). */
export const VIRTUAL_LIST_DEFAULT_OVERSCAN = 200;

export interface VirtualListProps<T> extends Omit<ListProps<T>, 'items'> {
  /** Pre-fetched items so far. Component drives the next-page fetch via onFetchMore. */
  items: readonly T[];
  /** Total item count when known; else use cursor-driven loading. */
  total?: number;
  /** Estimated row height in px (for scrollbar accuracy). Defaults to 48. */
  estimateSize?: number;
  /** Visible buffer in px above + below the viewport. Defaults to 200. */
  overscan?: number;
  /** Called when the user scrolls within `overscan` of the bottom. */
  onFetchMore?: () => Promise<void> | void;
  /** Called when the user scrolls within `overscan` of the top (for prev-cursor). */
  onFetchPrev?: () => Promise<void> | void;
  /**
   * Height of the scroll viewport in px. Defaults to 480 (10 rows at the
   * default estimate). Hosts that embed `<VirtualList>` in a flex container
   * can pass `'100%'` and let the parent size them.
   */
  viewportHeight?: number | string;
}

export function VirtualList<T>({
  items: itemsProp,
  data,
  renderItem,
  bordered,
  density = DEFAULT_DENSITY,
  variant = 'ghost',
  className,
  total,
  estimateSize = VIRTUAL_LIST_DEFAULT_ESTIMATE,
  overscan = VIRTUAL_LIST_DEFAULT_OVERSCAN,
  onFetchMore,
  onFetchPrev,
  viewportHeight = 480,
  selectable = false,
  idOf,
  selectedIds,
  onSelectionChange,
  bulkActions,
  onBulkAction,
}: VirtualListProps<T>): ReactNode {
  // Resolve items: explicit `items` wins; fall back to resolver-supplied `data`
  // array so the manifest's `data: { source: '...' }` binding works out of the
  // box (mirrors `<List>`).
  const items: readonly T[] =
    itemsProp ?? (Array.isArray(data) ? (data as readonly T[]) : ([] as readonly T[]));

  // Default renderer: same best-effort label as `<List>` so swap-in just works.
  const renderItemFn: (item: T, index: number) => ReactNode =
    renderItem ??
    ((item) => {
      if (item === null || item === undefined) return null;
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      if (typeof item === 'object') {
        const o = item as Record<string, unknown>;
        return (
          (o['title'] as string | undefined) ??
          (o['name'] as string | undefined) ??
          (o['label'] as string | undefined) ??
          JSON.stringify(item)
        );
      }
      return String(item);
    });

  const parentRef = useRef<HTMLDivElement>(null);
  const fetchMoreInFlight = useRef(false);
  const fetchPrevInFlight = useRef(false);

  // Wave 11 / Int-9 — multi-select wiring (mirrors `<List>`). The virtualizer
  // only renders viewport rows, but selection identities key by `idOf` so a
  // row scrolled out and back in stays selected. Range-select via Shift+Click
  // resolves indices against the FULL `items` sequence (not just the
  // viewport) so a user can shift-select a swath that spans the visible
  // window.
  const idResolver = idOf ?? ((_item: T, index: number): string => String(index));
  const anchorRef = useRef<string | null>(null);
  const [localSelected, setLocalSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
  const effectiveSelected = selectedIds ?? localSelected;
  const allIds = items.map((item, i) => idResolver(item, i));
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
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    // Convert px overscan to "rows" overscan — `useVirtualizer` overscan
    // is row-count, not px. We round up so we always overshoot rather
    // than undershoot.
    overscan: Math.max(1, Math.ceil(overscan / Math.max(1, estimateSize))),
  });

  // Edge-trigger handler: fires `onFetchMore` when the user scrolls within
  // `overscan` of the bottom, `onFetchPrev` when near the top. We dedupe via
  // refs so a single threshold crossing fires at most once until the parent
  // resolves with new items (re-render flips the in-flight flag back to false
  // on the next scroll event past the threshold).
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    if (
      onFetchMore &&
      !fetchMoreInFlight.current &&
      distanceFromBottom <= overscan &&
      // Only fetch more when we know more might exist (or `total` unset).
      (total === undefined || items.length < total)
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
  }, [items.length, onFetchMore, onFetchPrev, overscan, total]);

  // Reset the in-flight flags whenever the items array grows so a *next*
  // edge-crossing can fire. Without this, a user scrolling past the same
  // threshold twice with the same item count would never re-trigger.
  useEffect(() => {
    fetchMoreInFlight.current = false;
    fetchPrevInFlight.current = false;
  }, [items.length]);

  const rowPad = DENSITY_ROW_PADDING_PX[density];
  const baseItemStyle: CSSProperties = {
    paddingTop: `${String(rowPad)}px`,
    paddingBottom: `${String(rowPad)}px`,
  };

  // Wrapping div carries the scroll viewport so `useVirtualizer` can
  // measure. Inner spacer + absolutely-positioned rows give correct scroll
  // height without rendering off-screen DOM.
  const scroller = (
    <div
      ref={parentRef}
      data-cir-component="VirtualList"
      data-bordered={bordered ? 'true' : 'false'}
      data-density={density}
      data-cir-density={density}
      data-variant={variant}
      data-virtual="true"
      data-row-count={String(items.length)}
      data-total={total !== undefined ? String(total) : undefined}
      data-selectable={selectable ? 'true' : 'false'}
      onScroll={handleScroll}
      className={cn(contentVariantClass[variant], className)}
      style={{
        height: typeof viewportHeight === 'number' ? `${String(viewportHeight)}px` : viewportHeight,
        overflowY: 'auto',
        position: 'relative',
      }}
    >
      <ul
        data-cir-part="virtual-list-spacer"
        style={{
          height: `${String(rowVirtualizer.getTotalSize())}px`,
          width: '100%',
          position: 'relative',
          margin: 0,
          padding: 0,
          listStyle: 'none',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index] as T;
          const id = idResolver(item, virtualRow.index);
          const checked = selectable && effectiveSelected.has(id);
          return (
            <li
              key={virtualRow.key}
              data-cir-part="virtual-list-item"
              data-index={String(virtualRow.index)}
              data-selected={selectable ? (checked ? 'true' : 'false') : undefined}
              ref={rowVirtualizer.measureElement}
              style={{
                ...baseItemStyle,
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${String(virtualRow.start)}px)`,
              }}
            >
              {selectable ? (
                <input
                  type="checkbox"
                  data-cir-part="virtual-list-checkbox"
                  aria-label={`Select row ${String(virtualRow.index + 1)}`}
                  checked={checked}
                  onClick={(e): void => {
                    handleToggle(id, e);
                  }}
                  onChange={(): void => {
                    /* handled via onClick to access shiftKey */
                  }}
                />
              ) : null}
              {renderItemFn(item, virtualRow.index)}
            </li>
          );
        })}
      </ul>
    </div>
  );

  // Wave 11 / Int-9 — auto-mount the floating bar when the selection is
  // non-empty AND `bulkActions` were declared. Mirrors `<List>`.
  const showBar =
    selectable &&
    bulkActions !== undefined &&
    bulkActions.length > 0 &&
    effectiveSelected.size >= 1;
  if (!showBar) return scroller;
  return (
    <>
      {scroller}
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
VirtualList.displayName = 'VirtualList';

export function virtualListTextRender(props: VirtualListProps<unknown>): string {
  const len = props.items?.length ?? (Array.isArray(props.data) ? props.data.length : 0);
  const totalSuffix = props.total !== undefined ? ` of ${String(props.total)}` : '';
  return `[VirtualList: ${String(len)}${totalSuffix} items]`;
}

export const VirtualListBinding: ComponentBinding = {
  id: 'VirtualList',
  factory: VirtualList as ComponentBinding['factory'],
  manifestContract: {
    description:
      'Virtualized variant of <List> for high-cardinality data (Wave 10 / S-2). Mirrors the <List> contract and adds cursor-driven loading: hosts pre-fetch the items array and the component fires onFetchMore when the user scrolls within `overscan` of the bottom (and onFetchPrev for the top). Composition rule: forced when capability `expected_count > 500` (see policies/composes_hierarchy_for_long_lists).',
    allowed_props: {
      items: 'array',
      data: 'unknown',
      renderItem: 'function',
      bordered: 'boolean',
      density: 'string',
      variant: 'string',
      className: 'string',
      total: 'number',
      estimateSize: 'number',
      overscan: 'number',
      onFetchMore: 'function',
      onFetchPrev: 'function',
      viewportHeight: 'unknown',
      selectable: 'boolean',
      idOf: 'function',
      selectedIds: 'object',
      onSelectionChange: 'function',
      bulkActions: 'array',
      onBulkAction: 'function',
    },
  },
};
