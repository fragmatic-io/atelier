// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

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
 *
 * Wave 7 / P-8 (closing) — List renders the populated case only. Loading /
 * error / empty are walker-side substitutions: the manifest declares
 * `data.loading_state` / `data.error_state` / `data.empty_state` and the
 * `<RenderNode>` walker swaps the slot in before constructing this component
 * (or falls through to `BASELINE_RESOLVER_DEFAULTS` when no slot is declared).
 * Hosts that need direct host-side React composition compose `<Skeleton>` /
 * `<Alert>` / `<EmptyState>` themselves.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { durationFor, type ComponentBinding } from '@atelier/runtime';
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
  /**
   * Manifest contract slot for the resolver-supplied data array. When the
   * manifest renderer resolves a `data` binding, it threads the result
   * through this prop. Explicit `items` wins; falling back to `data`
   * keeps the manifest's `data: { source: '...' }` binding from
   * requiring a host-side adapter. Both are declared in
   * `ListBinding.manifestContract`.
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
  /**
   * Wave 11 / Int-1 — when true, rows whose id was not in the previous
   * render carry `data-cir-new="true"` for `durationFor('normal')` ms.
   * Pair with the host's `cir-row-appear` keyframe (see
   * `apps/demo/app/globals.css`) for an opacity ramp on append.
   * Defaults to false. Honours `prefers-reduced-motion` (the keyframe
   * collapses to 0ms when the OS preference is set).
   */
  animateRowAppear?: boolean;
}

export function List<T>({
  items: itemsProp,
  renderItem,
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
  animateRowAppear = false,
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
  // Wave 7 / P-8 (closing) — List no longer hand-rolls an empty branch; the
  // walker substitutes `data.empty_state` (or `BASELINE_RESOLVER_DEFAULTS.empty`)
  // before this component is constructed. With no rows we still render an
  // empty <ul> so the component never crashes when used outside the walker.
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

  // Wave 11 / Int-1 — row-appear tracking. Compare current ids against
  // the previous render's id set; rows whose id was absent get
  // `data-cir-new="true"` for one render so the host's keyframe fires.
  // Stored in state (not a ref) so the cleanup `useEffect` re-render
  // strips the attribute after `durationFor('normal')` ms.
  const prevIdsRef = useRef<ReadonlySet<string>>(new Set<string>());
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  useEffect(() => {
    if (!animateRowAppear) {
      // When the opt-in is off we never read these maps; reset to keep
      // the working set tiny if a host toggles the prop later.
      prevIdsRef.current = new Set<string>(allIds);
      return;
    }
    const prev = prevIdsRef.current;
    const fresh = new Set<string>();
    for (const id of allIds) {
      if (!prev.has(id)) fresh.add(id);
    }
    prevIdsRef.current = new Set<string>(allIds);
    if (fresh.size === 0) return;
    setNewIds(fresh);
    // Strip the attribute after the keyframe completes so subsequent
    // renders re-key the keyframe cleanly when the same id appears
    // again later.
    const ms = durationFor('normal');
    if (ms <= 0) {
      setNewIds(new Set<string>());
      return;
    }
    const t = setTimeout(() => {
      setNewIds(new Set<string>());
    }, ms);
    return (): void => {
      clearTimeout(t);
    };
    // `allIds` is recomputed every render — the join is the seam that
    // triggers the comparison only when the id sequence actually changes.
  }, [animateRowAppear, allIds.join(' ')]);
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
    const isNew = animateRowAppear && newIds.has(id);
    return (
      <li
        key={i}
        data-cir-part="list-item"
        data-selected={checked ? 'true' : 'false'}
        {...(isNew ? { 'data-cir-new': 'true' } : {})}
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
      data-cir-density={density}
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
        const id = idResolver(item, i);
        const isNew = animateRowAppear && newIds.has(id);
        return (
          <li
            key={i}
            data-cir-part="list-item"
            data-pinned="true"
            {...(isNew ? { 'data-cir-new': 'true' } : {})}
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
        const id = idResolver(item, i);
        const isNew = animateRowAppear && newIds.has(id);
        return (
          <li
            key={i}
            data-cir-part="list-item"
            {...(isNew ? { 'data-cir-new': 'true' } : {})}
            style={itemStyle}
          >
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
  manifestContract: {
    description:
      'Generic semantic <ul>. Either `items` (typed array) or `data` (the resolver-supplied alias) supplies rows; `renderItem` is optional (the component falls back to a best-effort label). The `data` slot is part of the formal contract — the renderer threads resolved data into it (see `RenderNode`). Replaces the implicit fallback band-aided in commit 0c6cc26.',
    allowed_props: {
      items: 'array',
      data: 'unknown',
      renderItem: 'function',
      bordered: 'boolean',
      density: 'string',
      variant: 'string',
      className: 'string',
      showPinnedSeparator: 'boolean',
      pinnedSeparatorVariant: 'string',
      pinAriaLabel: 'function',
      selectable: 'boolean',
      idOf: 'function',
      selectedIds: 'object',
      onSelectionChange: 'function',
      bulkActions: 'array',
      onBulkAction: 'function',
      animateRowAppear: 'boolean',
    },
  },
};
