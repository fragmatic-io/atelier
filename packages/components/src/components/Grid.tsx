// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * Grid — CSS grid primitive. Variants (Wave 6 / P-10): bordered, elevated,
 * ghost (default), tinted.
 *
 * Wave 7b / Int-9 — opt-in multi-select. When `selectable` is true AND
 * `items` + `renderItem` are supplied, the Grid renders one selectable
 * cell per item (each cell wraps the rendered content with a checkbox)
 * and keys selection by `idOf(item, i) ?? item.id`. The legacy
 * `children` mode (no items) is unchanged.
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { BulkActionBar, type BulkAction } from './BulkActionBar.js';
import { STACK_GAP_PX, type StackGap } from './Stack.js';
import { cn, layoutVariantClass, type LayoutVariant } from './_variants.js';
import { DEFAULT_DENSITY, densityScaleGapPx, type Density } from './density.js';

export type GridColumns = number | 'auto';
export type GridVariant = LayoutVariant;

/**
 * Wave 7b / Int-9 — minimal contract for selectable grid cells. An object
 * carrying a stable `id` so the Grid can key the selection set without an
 * `idOf` function.
 */
export interface GridItem {
  id: string;
  [key: string]: unknown;
}

export interface GridProps<T extends GridItem = GridItem> {
  columns?: GridColumns;
  gap?: StackGap;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: GridVariant;
  className?: string;
  children?: ReactNode;
  /**
   * Wave 7b / Int-9 — opt-in items mode for selectable grids. When supplied
   * alongside `selectable`, each item renders as one cell with a checkbox.
   */
  items?: readonly T[];
  /**
   * Manifest-friendly alias for `items`. When the manifest renderer resolves
   * a `data` binding it threads the resolved array as `data`. Explicit
   * `items` wins; otherwise we accept `data` if it is array-shaped.
   * Mirrors the same fallback `<List>` ships (Phase 2 #3).
   */
  data?: unknown;
  /** Renders the visible content of a single grid cell. Required when `items` is supplied. */
  renderItem?: (item: T, index: number) => ReactNode;
  /**
   * When true, Grid renders a checkbox over each cell and reflects
   * `data-selected` based on `selectedIds`. Requires `items` + `renderItem`.
   */
  selectable?: boolean;
  /** Stable id extractor; defaults to `item.id`. */
  idOf?: (item: T, index: number) => string;
  /** Read-only set of currently-selected ids. */
  selectedIds?: ReadonlySet<string>;
  /** Called whenever the selection set changes. */
  onSelectionChange?: (next: ReadonlySet<string>) => void;
  /** Bulk actions surfaced via `<BulkActionBar>` when one or more cells are selected. */
  bulkActions?: readonly BulkAction[];
  /** Click handler for a bulk action. Receives the action's id (= capability id). */
  onBulkAction?: (actionId: string) => void;
}

const AUTO_TRACK = 'repeat(auto-fit, minmax(200px, 1fr))';

export function Grid<T extends GridItem = GridItem>({
  columns = 'auto',
  gap = 'md',
  density = DEFAULT_DENSITY,
  variant = 'ghost',
  className,
  children,
  items: itemsProp,
  data,
  renderItem,
  selectable = false,
  idOf,
  selectedIds,
  onSelectionChange,
  bulkActions,
  onBulkAction,
}: GridProps<T>): ReactNode {
  const anchorRef = useRef<string | null>(null);
  const [localSelected, setLocalSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
  const tracks = columns === 'auto' ? AUTO_TRACK : `repeat(${String(columns)}, 1fr)`;
  const gapPx = densityScaleGapPx(STACK_GAP_PX[gap], density);
  const style: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: tracks,
    gap: `${String(gapPx)}px`,
  };

  // Resolve items: explicit `items` wins; else accept `data` if array-shaped
  // (the manifest renderer threads resolved data this way when `row_binding`
  // is set). When neither is supplied we fall back to legacy `children` mode.
  const items: readonly T[] | undefined =
    itemsProp ?? (Array.isArray(data) ? (data as readonly T[]) : undefined);

  // Selection wiring (only meaningful when `items` + `selectable`).
  // Default idOf reads `item.id` (string or number); falls back to the
  // index so manifest-supplied data with non-string ids (or no id at all)
  // doesn't crash the React-key derivation.
  const idResolver: (item: T, index: number) => string =
    idOf ??
    ((item: T, index: number): string => {
      const candidate = (item as { id?: unknown } | null | undefined)?.id;
      if (typeof candidate === 'string') return candidate;
      if (typeof candidate === 'number') return String(candidate);
      return String(index);
    });
  const effectiveSelected = selectedIds ?? localSelected;
  const usingItems = Array.isArray(items) && typeof renderItem === 'function';
  const itemList: readonly T[] = items ?? [];
  const allIds = usingItems ? itemList.map((item, i) => idResolver(item, i)) : [];
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

  const renderedChildren: ReactNode = usingItems
    ? itemList.map((item, i) => {
        const id = idResolver(item, i);
        const checked = selectable && effectiveSelected.has(id);
        if (!selectable) {
          return (
            <div key={id} data-cir-part="grid-item">
              {renderItem ? renderItem(item, i) : null}
            </div>
          );
        }
        return (
          <div
            key={id}
            data-cir-part="grid-item"
            data-selected={checked ? 'true' : 'false'}
            style={{ position: 'relative' }}
          >
            <input
              type="checkbox"
              data-cir-part="grid-checkbox"
              aria-label={`Select item ${String(i + 1)}`}
              checked={checked}
              onClick={(e): void => {
                handleToggle(id, e);
              }}
              onChange={(): void => {
                /* handled via onClick */
              }}
              style={{ position: 'absolute', top: 8, left: 8 }}
            />
            {renderItem ? renderItem(item, i) : null}
          </div>
        );
      })
    : children;

  const grid = (
    <div
      data-cir-component="Grid"
      data-columns={String(columns)}
      data-gap={gap}
      data-density={density}
      data-variant={variant}
      data-selectable={selectable ? 'true' : 'false'}
      className={cn(layoutVariantClass[variant], className)}
      style={style}
    >
      {renderedChildren}
    </div>
  );

  const showBar =
    selectable &&
    usingItems &&
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
Grid.displayName = 'Grid';
export function gridTextRender(props: GridProps): string {
  return `[Grid ${String(props.columns ?? 'auto')}]`;
}
export const GridBinding: ComponentBinding = {
  id: 'Grid',
  factory: Grid as ComponentBinding['factory'],
};
