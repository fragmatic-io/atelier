// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

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
 *
 * Marketplace pivot — `<Grid>` is now data-aware (mirrors `<List>`). When
 * `data` (or `items`) is supplied:
 *
 *   - **Manifest declared a child template** (`children.length === 1`)
 *     → render N copies of that child, threading each item via the
 *     child's `data` prop. This is the path the manifest uses to compose
 *     `<Grid data={products}>` over a `<Card>` template — the Card pulls
 *     its tile fields from the threaded item.
 *   - **No children declared** → default-render each item as a `<Card>`
 *     tile (image / title / subtitle / price / badge defaults derived
 *     from common product-shape fields). This is the zero-template form
 *     a host can fall back on without authoring a Card node at all.
 *   - **Custom `renderItem` supplied** (host-side React only — manifests
 *     are JSON and can't pass functions) → unchanged from pre-pivot.
 *
 * Compositional rule remains `{ can_contain: '*' }`. The renderer treats
 * the Grid as a leaf when `data`/`items` is supplied (rows come from the
 * data binding, not manifest children).
 *
 * The runtime threads `onAction(actionId, item)` onto each rendered Card
 * via the Grid's `actionSlots: ['onAction']` so per-item dispatch works
 * without per-tile wiring.
 *
 * Wave 7 / P-8 (closing) — Grid renders the populated case only. Loading /
 * error / empty are walker-side substitutions: the manifest declares
 * `data.loading_state` / `data.error_state` / `data.empty_state` and the
 * `<RenderNode>` walker swaps the slot in before constructing this component
 * (or falls through to `BASELINE_RESOLVER_DEFAULTS` when no slot is declared).
 * Hosts that need direct host-side React composition compose `<Skeleton>` /
 * `<Alert>` / `<EmptyState>` themselves.
 */
import {
  cloneElement,
  isValidElement,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { BulkActionBar, type BulkAction } from './BulkActionBar.js';
import { Card } from './Card.js';
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
   *
   * Marketplace pivot — `items` (or `data`) ALSO drives the data-aware
   * tile path: when supplied, the Grid renders one cell per item, threading
   * the item via the cell's `data` prop. See module-level docs.
   */
  items?: readonly T[];
  /**
   * Manifest-friendly alias for `items`. When the manifest renderer resolves
   * a `data` binding it threads the resolved array as `data`. Explicit
   * `items` wins; otherwise we accept `data` if it is array-shaped.
   * Mirrors the same fallback `<List>` ships (Phase 2 #3).
   */
  data?: unknown;
  /**
   * Renders the visible content of a single grid cell. When set, wins over
   * the manifest-declared template / default Card render. Required for
   * `selectable` + custom layouts; optional otherwise (the Grid falls back
   * to its data-aware tile path).
   */
  renderItem?: (item: T, index: number) => ReactNode;
  /**
   * Action slot — runtime-wired from the manifest's `actions` list via
   * `actionSlots: ['onAction']`. When the Grid renders cells per item,
   * `onAction` is threaded onto each rendered Card so per-item dispatch
   * works without the manifest authoring per-cell wiring.
   */
  onAction?: (actionId: string, item?: unknown) => Promise<void> | void;
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
  onAction,
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
  const usingItems = Array.isArray(items);
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

  // Pick the per-cell render strategy when `items` is supplied.
  //
  //   1. Explicit `renderItem` wins — host-side React only.
  //   2. Single manifest child → use it as a template; clone per item with
  //      `data: item` (and forward `onAction` so per-item dispatch works).
  //   3. No children → default-render as a `<Card data={item}>` tile; the
  //      Card resolves its tile fields from the item shape.
  //
  // Manifests are JSON so paths (2) and (3) are the only ones a manifest
  // can express — (1) exists for host-side composition.
  const childArray = Array.isArray(children)
    ? (children as ReactNode[])
    : children !== undefined && children !== null
      ? [children as ReactNode]
      : [];
  const validChildElements = childArray.filter((c) => isValidElement(c));
  const templateChild = validChildElements.length === 1 ? validChildElements[0] : undefined;

  function renderCell(item: T, index: number): ReactNode {
    if (renderItem !== undefined) return renderItem(item, index);
    if (templateChild !== undefined && isValidElement(templateChild)) {
      // Thread the item via `data`; preserve the template's other props.
      // Forward `onAction` only when the template hasn't declared its own,
      // so per-item dispatch flows from the Grid's runtime-wired slot.
      const existing = templateChild.props as Record<string, unknown>;
      const next: Record<string, unknown> = { ...existing, data: item };
      if (next['onAction'] === undefined && onAction !== undefined) {
        next['onAction'] = onAction;
      }
      return cloneElement(templateChild, next);
    }
    // Default tile render. The Card pulls fields from `item`.
    // We only thread `onAction` when set, since `exactOptionalPropertyTypes`
    // disallows passing `undefined` through the Card's optional slot.
    const cardProps: Record<string, unknown> = { data: item, density };
    if (onAction !== undefined) cardProps['onAction'] = onAction;
    return <Card {...cardProps} />;
  }

  const renderedChildren: ReactNode = usingItems
    ? itemList.map((item, i) => {
        const id = idResolver(item, i);
        const checked = selectable && effectiveSelected.has(id);
        if (!selectable) {
          return (
            <div key={id} data-cir-part="grid-item">
              {renderCell(item, i)}
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
            {renderCell(item, i)}
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
  actionSlots: ['onAction'],
  manifestContract: {
    description:
      'CSS grid primitive. Two modes: (1) legacy `children` mode — every child renders as a ' +
      'cell unchanged. (2) Data-aware tile mode (marketplace pivot) — when `data` (resolver-supplied ' +
      'array) or `items` is supplied, the Grid renders one cell per item. If the manifest declared ' +
      'a single child, it is used as a template — cloned per item with `data: item` threaded onto ' +
      'each clone. If no children were declared, each item default-renders as a `<Card data={item}>` ' +
      'tile (image / title / subtitle / price / badge derived from common product-shape fields). ' +
      "The runtime wires `onAction(actionId, item)` from the manifest's `actions` list via " +
      "`actionSlots: ['onAction']`; the Grid forwards it onto each rendered Card so per-item " +
      'dispatch works without per-cell wiring. Selection / `bulkActions` / `selectedIds` work the ' +
      'same in both modes.',
    allowed_props: {
      columns: 'unknown',
      gap: 'string',
      density: 'string',
      variant: 'string',
      className: 'string',
      items: 'array',
      data: 'unknown',
      renderItem: 'function',
      onAction: 'function',
      selectable: 'boolean',
      idOf: 'function',
      selectedIds: 'object',
      onSelectionChange: 'function',
      bulkActions: 'array',
      onBulkAction: 'function',
    },
  },
};
