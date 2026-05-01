// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * List — generic semantic <ul>. Variants (Wave 6 / P-10): bordered,
 * elevated, ghost (default), tinted.
 *
 * Wave 7b / Nav-3 — sticky pinned items. An item with `pinned: true` floats
 * to the top of the rendered list, sticks to the top of the scroll container
 * via `position: sticky`, and gets a small Unicode pin indicator. A faint
 * separator divides the pinned block from the unpinned tail (toggle via
 * `showPinnedSeparator`). React keys are derived from the item's index in
 * the SOURCE array so reconciliation is stable across pin/unpin transitions.
 *
 * Wave 7b / Int-9 — opt-in multi-select. When `selectable` is true the List
 * renders a leading checkbox per row; rows pick up `data-selected` when
 * present in `selectedIds`. Click toggles, Shift+Click range-selects between
 * the last clicked anchor and the new row. When `bulkActions` is supplied
 * AND the selection is non-empty, the List auto-mounts a `<BulkActionBar>`
 * via portal at bottom-center. Backwards compat: lists without `selectable`
 * behave identically to pre-Int-9 builds.
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { BulkActionBar, type BulkAction } from './BulkActionBar.js';
import {
  cn,
  contentVariantClass,
  pinnedSeparatorClass,
  type ContentVariant,
  type PinnedSeparatorVariant,
} from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_ROW_PADDING_PX, type Density } from './density.js';

export type ListVariant = ContentVariant;

/** Unicode pushpin used as the default pinned-item indicator. */
const PIN_GLYPH = '\u{1F4CC}';

/**
 * Returns true if `item` is a non-null object with a truthy `pinned` field.
 * Items without the field render unchanged from pre-Nav-3 behaviour.
 */
function isPinned(item: unknown): boolean {
  return (
    typeof item === 'object' &&
    item !== null &&
    'pinned' in item &&
    (item as { pinned?: unknown }).pinned === true
  );
}

export interface ListProps<T> {
  items?: readonly T[];
  renderItem?: (item: T, index: number) => ReactNode;
  empty?: ReactNode;
  /**
   * Manifest-friendly alias for `items`. When the manifest renderer
   * resolves a `data` binding, it passes the array as `data`. We accept
   * either: explicit `items` wins, otherwise fall back to `data` if it
   * is array-shaped, otherwise empty.
   */
  data?: unknown;
  bordered?: boolean;
  /** Personalisation density. Renderer fills from intent profile when unset. */
  density?: Density;
  variant?: ListVariant;
  className?: string;
  /**
   * Wave 7b / Nav-3 — render a faint divider between the pinned block and
   * the unpinned tail. Defaults to `true`. Setting to `false` is useful when
   * the host already paints its own visual separation (e.g. a `tinted` row
   * background only on pinned items).
   */
  showPinnedSeparator?: boolean;
  /** Visual variant of the pinned-block separator. */
  pinnedSeparatorVariant?: PinnedSeparatorVariant;
  /**
   * Override the `aria-label` applied to every pinned `<li>`. Receives the
   * raw item so callers can localise per-language or per-row. Defaults to
   * `'Pinned'`.
   */
  pinAriaLabel?: (item: T) => string;
  /**
   * Wave 7b / Int-9 — opt-in multi-select. When true, every row renders a
   * leading checkbox and reflects `data-selected` based on `selectedIds`.
   */
  selectable?: boolean;
  /** Stable id extractor used to key rows into `selectedIds`. Defaults to the row index as a string. */
  idOf?: (item: T, index: number) => string;
  /** Read-only set of currently-selected ids. Only consulted when `selectable` is true. */
  selectedIds?: ReadonlySet<string>;
  /** Called whenever the selection set changes. Hosts pass an immutable next-state. */
  onSelectionChange?: (next: ReadonlySet<string>) => void;
  /**
   * Bulk actions surfaced via `<BulkActionBar>` when one or more rows are
   * selected. When omitted, the List does NOT auto-mount the bar — callers
   * can render their own bar above / outside the list if they prefer.
   */
  bulkActions?: readonly BulkAction[];
  /** Click handler for a bulk action. Receives the action's id (= capability id). */
  onBulkAction?: (actionId: string) => void;
}

export function List<T>({
  items: itemsProp,
  renderItem,
  empty,
  bordered,
  data,
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
}: ListProps<T>): ReactNode {
  // Resolve items: explicit `items` prop wins; else accept `data` if it
  // is an array (the manifest renderer threads resolved data this way);
  // else empty so the component never crashes on `length`.
  const items: readonly T[] =
    itemsProp ?? (Array.isArray(data) ? (data as readonly T[]) : ([] as readonly T[]));
  // Default renderer: when the manifest doesn't supply `renderItem`,
  // print a best-effort label so the row is visible. Hosts that need
  // rich rows pass their own `renderItem`.
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
  // Anchor for Shift+Click range-select. Persisted across renders so the
  // user can extend the range from any prior click. Reset on `clear`.
  const anchorRef = useRef<string | null>(null);
  // Local fallback selection when the host did NOT pass `selectedIds`.
  // Keeps the component usable as an uncontrolled primitive in demos.
  const [localSelected, setLocalSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
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
  // Sticky styling is emitted inline so non-Tailwind hosts get the behaviour
  // without any CSS-config surgery. Hosts can still override via the
  // `data-pinned="true"` selector.
  const pinnedStyle: CSSProperties = {
    ...itemStyle,
    position: 'sticky',
    top: 0,
    zIndex: 10,
  };
  // Stable partition. We carry the original source index alongside each item
  // so React keys survive a pin/unpin flip.
  const indexed = items.map((item, i) => ({ item, i }));
  const pinnedRows = indexed.filter(({ item }) => isPinned(item));
  const unpinnedRows = indexed.filter(({ item }) => !isPinned(item));
  const hasPinned = pinnedRows.length > 0;

  // Selection helpers. We resolve the effective set by preferring the
  // host-controlled `selectedIds` over the local fallback.
  const idResolver = idOf ?? ((_item: T, index: number): string => String(index));
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

  const renderSelectableLi = (
    item: T,
    i: number,
    style: CSSProperties,
    extraProps: Readonly<Record<string, string>>,
  ): ReactNode => {
    const id = idResolver(item, i);
    const checked = effectiveSelected.has(id);
    return (
      <li
        key={i}
        data-cir-part="list-item"
        data-selected={checked ? 'true' : 'false'}
        style={style}
        {...extraProps}
      >
        <input
          type="checkbox"
          data-cir-part="list-checkbox"
          aria-label={`Select row ${String(i + 1)}`}
          checked={checked}
          onClick={(e): void => {
            handleToggle(id, e);
          }}
          // `onClick` already updates state — `onChange` exists only to keep
          // React happy about the controlled-input contract.
          onChange={(): void => {
            /* handled via onClick to access shiftKey */
          }}
        />
        {renderItemFn(item, i)}
      </li>
    );
  };

  const ul = (
    <ul
      data-cir-component="List"
      data-bordered={bordered ? 'true' : 'false'}
      data-density={density}
      data-variant={variant}
      data-has-pinned={hasPinned ? 'true' : 'false'}
      data-selectable={selectable ? 'true' : 'false'}
      className={cn(contentVariantClass[variant], className)}
    >
      {pinnedRows.map(({ item, i }) => {
        const ariaLabel = pinAriaLabel ? pinAriaLabel(item) : 'Pinned';
        if (selectable) {
          return renderSelectableLi(item, i, pinnedStyle, {
            'data-pinned': 'true',
            'aria-label': ariaLabel,
          });
        }
        return (
          <li
            key={i}
            data-cir-part="list-item"
            data-pinned="true"
            aria-label={ariaLabel}
            style={pinnedStyle}
          >
            <span data-pin-indicator="true" aria-hidden="true">
              {PIN_GLYPH}
            </span>
            {renderItemFn(item, i)}
          </li>
        );
      })}
      {hasPinned && showPinnedSeparator ? (
        <li
          key="cir-pinned-separator"
          aria-hidden="true"
          data-cir-part="pinned-separator"
          className={pinnedSeparatorClass[pinnedSeparatorVariant]}
          style={{ listStyle: 'none', padding: 0, height: 0 }}
        />
      ) : null}
      {unpinnedRows.map(({ item, i }) => {
        if (selectable) {
          return renderSelectableLi(item, i, itemStyle, {});
        }
        return (
          <li key={i} data-cir-part="list-item" style={itemStyle}>
            {renderItemFn(item, i)}
          </li>
        );
      })}
    </ul>
  );

  // When selectable + bulk actions present + selection non-empty, auto-mount
  // the floating bar via portal. Hosts that want the bar elsewhere should
  // omit `bulkActions` and render their own.
  const showBar =
    selectable &&
    bulkActions !== undefined &&
    bulkActions.length > 0 &&
    effectiveSelected.size >= 1;
  if (!showBar) return ul;
  return (
    <>
      {ul}
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
List.displayName = 'List';
export function listTextRender(props: ListProps<unknown>): string {
  const len = props.items?.length ?? (Array.isArray(props.data) ? props.data.length : 0);
  return `[List: ${String(len)} items]`;
}
export const ListBinding: ComponentBinding = {
  id: 'List',
  factory: List as ComponentBinding['factory'],
};
