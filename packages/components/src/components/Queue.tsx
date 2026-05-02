// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Queue — generic "list of items requiring action" primitive.
 *
 * Subsumes the inbox / task / issue / review pattern that hosts kept
 * re-implementing as `DecisionQueue` / `TaskQueue` / `IssueQueue`. The
 * marketplace-is-the-product pivot promotes it to baseline so demos can
 * collapse those custom bindings onto a single composable shape.
 *
 * Shape:
 *   - `data` / `items` — array of records (manifest binding threads `data`)
 *   - `actions` — declarative per-row capability buttons (id = capability id,
 *     label, variant)
 *   - `onAction(actionId, item)` — single action slot the runtime wires from
 *     the manifest's `actions` list (sanitised id resolution)
 *   - `renderItem(item, index)` — optional custom row body; default reaches for
 *     `item.title` / `item.name` / `item.subject` / a JSON fallback
 *   - `groupBy(item)` + `groupLabels` + `groupOrder` — optional grouping (the
 *     pattern `TaskQueue` used for due-date buckets)
 *   - per-item flags `pinned: true` and `emphasis: '<tag>'` surface on the row
 *     as `data-pinned="true"` / `data-emphasis="<tag>"` so a host stylesheet
 *     can tint salient rows without a custom binding (the data resolver picks
 *     which rows carry the flag — Queue is the agnostic surface)
 *
 * Composition role: `'list'` in policy terms (long-list-hierarchy obligations
 * apply, e.g. virtualization above a threshold once Vis-2 / S-2 land).
 *
 * Manifest authors compose Queue inside any layout container the route uses;
 * the framework's `composes_according_to_rules` policy treats it as a leaf
 * (its rows come from the `data` binding, not manifest children).
 *
 * Wave 7 / P-8 (closing) — Queue renders the populated case only. Loading /
 * error / empty are walker-side substitutions: the manifest declares
 * `data.loading_state` / `data.error_state` / `data.empty_state` and the
 * `<RenderNode>` walker swaps the slot in before constructing this component
 * (or falls through to `BASELINE_RESOLVER_DEFAULTS` when no slot is declared).
 * Hosts that need direct host-side React composition compose `<Skeleton>` /
 * `<Alert>` / `<EmptyState>` themselves.
 *
 * Wave 11 / Int-9 — opt-in multi-select. Mirrors the `<List>` / `<Table>`
 * shape: `selectable` renders a leading checkbox per row, click toggles,
 * Shift+Click range-selects between the last clicked anchor and the new row.
 * When `bulkActions` is supplied AND the selection is non-empty the Queue
 * auto-mounts a `<BulkActionBar>` via portal at bottom-center. Optimistic-hide
 * cooperates with selection — hidden ids are dropped from the selection set
 * automatically so a per-row archive on a selected row leaves the bar in a
 * coherent state. Backwards compat: queues without `selectable` behave
 * identically to pre-Int-9 builds.
 *
 * Wave 11 / Nav-3 — sticky pinned rows. Items with `pinned: true` partition
 * to the top of the rendered list (in source order), pick up `position:
 * sticky` so they stay anchored when an ancestor scrolls, and a faint
 * separator divides the pinned block from the unpinned tail (toggle via
 * `showPinnedSeparator`). Closes the parity gap with `<List>` / `<Table>`
 * which already partition + stick. The `pinIcon` prop accepts an `IconRef`
 * for hosts wired to a Vis-3 `IconResolver`, `null` to disable the glyph,
 * or `undefined` (default) to keep the Unicode pushpin. Grouping is
 * mutually-exclusive with sticky pinning — when `groupBy` is supplied the
 * pinned partition is bypassed (rows still carry `data-pinned="true"` and
 * the glyph, but ordering is owned by the group buckets).
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { durationFor, type ComponentBinding } from '@atelier/runtime';
import { BulkActionBar, type BulkAction } from './BulkActionBar.js';
import { Icon } from './Icon.js';
import { normalizeIconRef, type IconRef } from '../icons/icon-ref.js';
import {
  cn,
  contentVariantClass,
  actionVariantClass,
  pinnedSeparatorClass,
  type ContentVariant,
  type ActionVariant,
  type PinnedSeparatorVariant,
} from './_variants.js';
import { DEFAULT_DENSITY, DENSITY_ROW_PADDING_PX, type Density } from './density.js';

export type QueueVariant = ContentVariant;

/**
 * Per-row action declaration. `id` is the capability dot-path the manifest
 * publishes. The runtime wires `onAction` to dispatch through the action
 * registry, so hosts never plumb dispatchers per-button.
 */
export interface QueueAction {
  id: string;
  label: string;
  variant?: ActionVariant;
  /** Optional inline confirmation text. When present, the button toggles into a
   *  "click again to confirm" state on first click; second click dispatches. */
  confirmInline?: string;
}

export interface QueueProps<T = unknown> {
  /** Resolver-supplied data binding. When `items` is omitted, an array `data` is used. */
  data?: unknown;
  /** Explicit row array. Wins over `data` when both are supplied. */
  items?: readonly T[];
  /** Card-style heading rendered above the rows. */
  title?: string;
  /** Per-row action buttons. */
  actions?: readonly QueueAction[];
  /**
   * Action slot. The runtime resolves the manifest's `actions` list into this
   * dispatcher; hosts never wire it manually. Receives the action id and the
   * row item.
   */
  onAction?: (actionId: string, item: T) => Promise<void> | void;
  /** Custom row body. Default reaches for `item.title`/`name`/`subject`/JSON fallback. */
  renderItem?: (item: T, index: number) => ReactNode;
  /** Stable id extractor. Defaults to `item.id` (when present) or row index. */
  idOf?: (item: T, index: number) => string;
  /** Optional grouping. Returns the group key for an item; rows are bucketed and labelled. */
  groupBy?: (item: T) => string;
  /** Display labels per group key. Missing keys fall back to the raw key. */
  groupLabels?: Readonly<Record<string, string>>;
  /** Render order for groups. Keys not listed render after listed ones in encounter order. */
  groupOrder?: readonly string[];
  /** Per-item optimistic hide on a successful action. Useful for archive/complete. Default true. */
  optimisticHide?: boolean;
  density?: Density;
  variant?: QueueVariant;
  className?: string;
  /**
   * Wave 11 / Int-1 — when true, rows whose id was not in the previous
   * render carry `data-cir-new="true"` for `durationFor('normal')` ms.
   * Pair with the host's `cir-row-appear` keyframe in `globals.css`.
   * Defaults to false. Honours `prefers-reduced-motion`.
   */
  animateRowAppear?: boolean;
  /**
   * Wave 11 / Int-9 — opt-in multi-select. When true, every row renders a
   * leading checkbox and reflects `data-selected` based on `selectedIds`.
   */
  selectable?: boolean;
  /** Read-only set of currently-selected ids. Only consulted when `selectable` is true. */
  selectedIds?: ReadonlySet<string>;
  /** Called whenever the selection set changes. Hosts pass an immutable next-state. */
  onSelectionChange?: (next: ReadonlySet<string>) => void;
  /**
   * Bulk actions surfaced via `<BulkActionBar>` when one or more rows are
   * selected. When omitted, the Queue does NOT auto-mount the bar — callers
   * can render their own bar above / outside the queue if they prefer.
   */
  bulkActions?: readonly BulkAction[];
  /** Click handler for a bulk action. Receives the action's id (= capability id). */
  onBulkAction?: (actionId: string) => void;
  /**
   * Wave 11 / Nav-3 — render a faint divider between the pinned block and
   * the unpinned tail. Defaults to `true`. Setting to `false` is useful when
   * the host already paints its own visual separation.
   */
  showPinnedSeparator?: boolean;
  /** Visual variant of the pinned-block separator. */
  pinnedSeparatorVariant?: PinnedSeparatorVariant;
  /**
   * Override the `aria-label` applied to every pinned row. Receives the raw
   * item so callers can localise per-language or per-row. Defaults to
   * `'Pinned'`.
   */
  pinAriaLabel?: (item: T) => string;
  /**
   * Override the pinned-row glyph. `undefined` (default) keeps the Unicode
   * pushpin (`\u{1F4CC}`). `null` disables the glyph entirely. An `IconRef`
   * (string or `{ set, name }` bag) renders via the Vis-3 `<Icon>` resolver.
   */
  pinIcon?: IconRef | null;
}

const PIN_GLYPH = '\u{1F4CC}';

function defaultIdOf<T>(item: T, index: number): string {
  if (typeof item === 'object' && item !== null && 'id' in item) {
    const id = (item as { id?: unknown }).id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return String(index);
}

function defaultRender<T>(item: T): ReactNode {
  if (item === null || item === undefined) return null;
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  if (typeof item === 'object') {
    const o = item as Record<string, unknown>;
    return (
      (o['title'] as string | undefined) ??
      (o['name'] as string | undefined) ??
      (o['subject'] as string | undefined) ??
      (o['label'] as string | undefined) ??
      JSON.stringify(item)
    );
  }
  return String(item);
}

/** Best-effort error message extractor. Surfaces `.message` on Error-shaped objects. */
function errorMessage(err: unknown): string {
  if (err === null || err === undefined) return '';
  if (typeof err === 'string') return err;
  if (typeof err === 'number' || typeof err === 'boolean') return String(err);
  if (typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  // Non-Error object — avoid `[object Object]` from String() and try a
  // structured representation instead.
  try {
    return JSON.stringify(err);
  } catch {
    return '';
  }
}

export function Queue<T = unknown>({
  data,
  items: itemsProp,
  title,
  actions,
  onAction,
  renderItem,
  idOf = defaultIdOf,
  groupBy,
  groupLabels,
  groupOrder,
  optimisticHide = true,
  density = DEFAULT_DENSITY,
  variant = 'ghost',
  className,
  animateRowAppear = false,
  selectable = false,
  selectedIds,
  onSelectionChange,
  bulkActions,
  onBulkAction,
  showPinnedSeparator = true,
  pinnedSeparatorVariant = 'default',
  pinAriaLabel,
  pinIcon,
}: QueueProps<T>): ReactNode {
  const items: readonly T[] =
    itemsProp ?? (Array.isArray(data) ? (data as readonly T[]) : ([] as readonly T[]));
  const renderRow = renderItem ?? ((item: T) => defaultRender(item));

  // Per-row busy + optimistically-hidden state. Both keyed by the row id so we
  // never confuse rows that share content (e.g. duplicate titles).
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [confirming, setConfirming] = useState<string | null>(null); // `${rowId}|${actionId}`
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Wave 11 / Int-9 — selection state. Anchor for Shift+Click range-select
  // is persisted across renders so the user can extend the range from any
  // prior click. Local fallback selection makes the component usable as an
  // uncontrolled primitive in demos.
  const anchorRef = useRef<string | null>(null);
  const [localSelected, setLocalSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
  const effectiveSelected = selectedIds ?? localSelected;
  const emitSelection = (next: ReadonlySet<string>): void => {
    if (onSelectionChange) onSelectionChange(next);
    else setLocalSelected(next);
  };

  const flashFeedback = (tone: 'success' | 'error', text: string): void => {
    setFeedback({ tone, text });
    setTimeout(() => {
      setFeedback(null);
    }, 2000);
  };

  // Apply optimistic-hide overlay. Wave 7 / P-8 (closing) — Queue no longer
  // hand-rolls a loading / error / empty branch; the walker substitutes the
  // appropriate state slot before this component is constructed. When every
  // row has been optimistically hidden post-render the component still emits
  // the populated <section> (with no <li> rows) — the walker doesn't
  // re-evaluate state after the component mounts.
  const visibleItems = items
    .map((item, i) => ({ item, i, id: idOf(item, i) }))
    .filter(({ id }) => !hidden.has(id));

  // Wave 11 / Int-1 — row-appear tracking. Mirrors `<List>`. Compares
  // current visible ids against the previous render; rows whose id was
  // absent get `data-cir-new="true"` for `durationFor('normal')` ms so
  // the host's `cir-row-appear` keyframe fires.
  const prevIdsRef = useRef<ReadonlySet<string>>(new Set<string>());
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const visibleIds = visibleItems.map(({ id }) => id);
  useEffect(() => {
    if (!animateRowAppear) {
      prevIdsRef.current = new Set<string>(visibleIds);
      return;
    }
    const prev = prevIdsRef.current;
    const fresh = new Set<string>();
    for (const id of visibleIds) {
      if (!prev.has(id)) fresh.add(id);
    }
    prevIdsRef.current = new Set<string>(visibleIds);
    if (fresh.size === 0) return;
    setNewIds(fresh);
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
  }, [animateRowAppear, visibleIds.join(' ')]);

  const rowPad = DENSITY_ROW_PADDING_PX[density];
  const rowStyle: CSSProperties = {
    paddingTop: `${String(rowPad)}px`,
    paddingBottom: `${String(rowPad)}px`,
  };
  // Sticky styling is emitted inline so non-Tailwind hosts get the behaviour
  // without any CSS-config surgery. Only fires when an ancestor has overflow;
  // when Queue is composed inside a non-scrolling card the rule is inert.
  const pinnedRowStyle: CSSProperties = {
    ...rowStyle,
    position: 'sticky',
    top: 0,
    zIndex: 10,
  };

  // Pin glyph renderer. Mirrors the `IconRef`-or-string pattern used by
  // `<Button icon=…>` (Wave 11 / Vis-3): `null` disables the glyph,
  // `undefined` (default) keeps the Unicode pushpin, an `IconRef` resolves
  // through `<Icon>`.
  const renderPinGlyph = (): ReactNode => {
    if (pinIcon === null) return null;
    if (pinIcon === undefined) {
      return (
        <span data-cir-part="queue-pin" data-pin-indicator="true" aria-hidden="true">
          {PIN_GLYPH}
        </span>
      );
    }
    const ref = normalizeIconRef(pinIcon);
    return (
      <span data-cir-part="queue-pin" data-pin-indicator="true" aria-hidden="true">
        <Icon set={ref.set} name={ref.name} />
      </span>
    );
  };

  const dispatch = async (actionId: string, item: T, rowId: string): Promise<void> => {
    if (onAction === undefined) return;
    setBusyId(rowId);
    try {
      await onAction(actionId, item);
      flashFeedback('success', 'Done');
      if (optimisticHide) {
        setHidden((prev) => {
          const next = new Set(prev);
          next.add(rowId);
          return next;
        });
        // Wave 11 / Int-9 — drop the dismissed row from the selection set
        // so the bulk-action bar count stays coherent with what's actually
        // visible. Mirrors the marketplace pivot's `optimisticHide: true`
        // contract.
        if (selectable && effectiveSelected.has(rowId)) {
          const nextSel = new Set(effectiveSelected);
          nextSel.delete(rowId);
          emitSelection(nextSel);
        }
      }
    } catch (e) {
      flashFeedback('error', errorMessage(e) || 'Action failed');
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  };

  // Toggle / range-select helpers (mirror `<List>`).
  const handleToggle = (
    id: string,
    visibleIdSeq: readonly string[],
    e: React.MouseEvent | React.ChangeEvent,
  ): void => {
    const isShiftClick =
      'shiftKey' in (e as unknown as { shiftKey?: boolean }) &&
      (e as unknown as { shiftKey?: boolean }).shiftKey === true;
    const next = new Set<string>(effectiveSelected);
    if (isShiftClick && anchorRef.current && anchorRef.current !== id) {
      const fromIdx = visibleIdSeq.indexOf(anchorRef.current);
      const toIdx = visibleIdSeq.indexOf(id);
      if (fromIdx !== -1 && toIdx !== -1) {
        const lo = Math.min(fromIdx, toIdx);
        const hi = Math.max(fromIdx, toIdx);
        for (let k = lo; k <= hi; k++) {
          const cur = visibleIdSeq[k];
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

  const handleClick = async (action: QueueAction, item: T, rowId: string): Promise<void> => {
    if (action.confirmInline !== undefined) {
      const key = `${rowId}|${action.id}`;
      if (confirming !== key) {
        setConfirming(key);
        return;
      }
    }
    await dispatch(action.id, item, rowId);
  };

  const isItemPinned = (item: T): boolean =>
    typeof item === 'object' &&
    item !== null &&
    'pinned' in item &&
    (item as { pinned?: unknown }).pinned === true;

  const renderRowEl = (
    entry: { item: T; i: number; id: string },
    opts: { sticky?: boolean } = {},
  ): ReactNode => {
    const pinned = isItemPinned(entry.item);
    // Per-item salience tag. Mirrors the `pinned` pattern: items can carry an
    // `emphasis` field (any string — typical values: 'high', 'hero',
    // 'comfortable') that surfaces as `data-emphasis` on the row so host
    // stylesheets can tint without a custom binding. Decided by the data
    // resolver / manifest, not by Queue itself.
    let emphasis: string | undefined;
    if (typeof entry.item === 'object' && entry.item !== null && 'emphasis' in entry.item) {
      const e = (entry.item as { emphasis?: unknown }).emphasis;
      if (typeof e === 'string' && e.length > 0) emphasis = e;
    }
    const busy = busyId === entry.id;
    const isNew = animateRowAppear && newIds.has(entry.id);
    const checked = selectable && effectiveSelected.has(entry.id);
    const ariaLabel = pinned && pinAriaLabel ? pinAriaLabel(entry.item) : undefined;
    const useSticky = pinned && opts.sticky === true;
    return (
      <li
        key={entry.id}
        data-cir-part="queue-row"
        data-pinned={pinned ? 'true' : 'false'}
        {...(emphasis !== undefined ? { 'data-emphasis': emphasis } : {})}
        {...(isNew ? { 'data-cir-new': 'true' } : {})}
        data-busy={busy ? 'true' : 'false'}
        data-selected={selectable ? (checked ? 'true' : 'false') : undefined}
        {...(pinned ? { 'aria-label': ariaLabel ?? 'Pinned' } : {})}
        style={useSticky ? pinnedRowStyle : rowStyle}
      >
        {selectable ? (
          <input
            type="checkbox"
            data-cir-part="queue-checkbox"
            aria-label={`Select row ${String(entry.i + 1)}`}
            checked={checked}
            onClick={(e): void => {
              handleToggle(entry.id, visibleIds, e);
            }}
            // `onClick` already updates state — `onChange` exists only to keep
            // React happy about the controlled-input contract.
            onChange={(): void => {
              /* handled via onClick to access shiftKey */
            }}
          />
        ) : null}
        {pinned ? renderPinGlyph() : null}
        <div data-cir-part="queue-row-body" style={{ flex: 1, minWidth: 0 }}>
          {renderRow(entry.item, entry.i)}
        </div>
        {actions !== undefined && actions.length > 0 ? (
          <div data-cir-part="queue-row-actions" style={{ display: 'flex', gap: '8px' }}>
            {actions.map((action) => {
              const key = `${entry.id}|${action.id}`;
              const isConfirming = confirming === key;
              const label =
                isConfirming && action.confirmInline !== undefined
                  ? action.confirmInline
                  : action.label;
              return (
                <button
                  key={action.id}
                  type="button"
                  data-cir-part="queue-action"
                  data-action-id={action.id}
                  data-confirming={isConfirming ? 'true' : 'false'}
                  className={cn(actionVariantClass[action.variant ?? 'secondary'])}
                  disabled={busy || onAction === undefined}
                  onClick={(): void => {
                    void handleClick(action, entry.item, entry.id);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
      </li>
    );
  };

  // Group rows. When `groupBy` is omitted, the entire list renders as one
  // unlabelled group (the most common case).
  const useGrouping = groupBy !== undefined;
  let grouped: Array<{ key: string; label: string; rows: typeof visibleItems }>;
  if (useGrouping) {
    const buckets = new Map<string, typeof visibleItems>();
    for (const entry of visibleItems) {
      const key = groupBy(entry.item);
      const bucket = buckets.get(key);
      if (bucket === undefined) {
        buckets.set(key, [entry]);
      } else {
        bucket.push(entry);
      }
    }
    const orderedKeys: string[] = [];
    if (groupOrder !== undefined) {
      for (const k of groupOrder) {
        if (buckets.has(k)) orderedKeys.push(k);
      }
    }
    for (const k of buckets.keys()) {
      if (!orderedKeys.includes(k)) orderedKeys.push(k);
    }
    grouped = orderedKeys.map((key) => ({
      key,
      label: groupLabels?.[key] ?? key,
      rows: buckets.get(key) ?? [],
    }));
  } else {
    grouped = [{ key: '_all', label: '', rows: visibleItems }];
  }

  // Wave 11 / Nav-3 — partition pinned items to the top within each group's
  // visible rows. The most common case is a single ungrouped queue (the
  // `_all` bucket); under explicit `groupBy` each bucket is partitioned
  // independently so a "today" / "later" split still pins within "today".
  const hasAnyPinned = visibleItems.some(({ item }) => isItemPinned(item));

  const section = (
    <section
      data-cir-component="Queue"
      data-density={density}
      data-cir-density={density}
      data-variant={variant}
      data-selectable={selectable ? 'true' : 'false'}
      data-has-pinned={hasAnyPinned ? 'true' : 'false'}
      className={cn(contentVariantClass[variant], className)}
      aria-label={title}
    >
      {title !== undefined ? (
        <header data-cir-part="queue-header">
          <h3 data-cir-part="queue-title">{title}</h3>
        </header>
      ) : null}
      {feedback !== null ? (
        <div
          data-cir-part="queue-feedback"
          data-tone={feedback.tone}
          role="status"
          aria-live="polite"
        >
          {feedback.text}
        </div>
      ) : null}
      {grouped.map((group) => {
        const pinnedRows = group.rows.filter(({ item }) => isItemPinned(item));
        const unpinnedRows = group.rows.filter(({ item }) => !isItemPinned(item));
        const hasPinnedHere = pinnedRows.length > 0;
        return (
          <div
            key={group.key}
            data-cir-part="queue-group"
            data-group-key={group.key}
            data-cir-density={density}
          >
            {useGrouping && group.label.length > 0 ? (
              <div data-cir-part="queue-group-label">{group.label}</div>
            ) : null}
            <ul data-cir-part="queue-rows" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {pinnedRows.map((entry) => renderRowEl(entry, { sticky: true }))}
              {hasPinnedHere && showPinnedSeparator ? (
                <li
                  key="cir-pinned-separator"
                  aria-hidden="true"
                  data-cir-part="pinned-separator"
                  className={pinnedSeparatorClass[pinnedSeparatorVariant]}
                  style={{ listStyle: 'none', padding: 0, height: 0 }}
                />
              ) : null}
              {unpinnedRows.map((entry) => renderRowEl(entry))}
            </ul>
          </div>
        );
      })}
    </section>
  );

  // Wave 11 / Int-9 — auto-mount the floating bar when selection non-empty
  // and `bulkActions` declared. Hosts that want the bar elsewhere should
  // omit `bulkActions` and render their own.
  const showBar =
    selectable &&
    bulkActions !== undefined &&
    bulkActions.length > 0 &&
    effectiveSelected.size >= 1;
  if (!showBar) return section;
  return (
    <>
      {section}
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

Queue.displayName = 'Queue';

export function queueTextRender(props: QueueProps<unknown>): string {
  const len =
    props.items?.length ?? (Array.isArray(props.data) ? (props.data as unknown[]).length : 0);
  const title = props.title !== undefined ? `: ${props.title}` : '';
  return `[Queue${title}: ${String(len)} items]`;
}

export const QueueBinding: ComponentBinding = {
  id: 'Queue',
  factory: Queue as ComponentBinding['factory'],
  compositionRole: 'list',
  actionSlots: ['onAction'],
  manifestContract: {
    description:
      'Generic "items requiring action" primitive. Subsumes inbox/task/issue/review patterns. ' +
      'Reads rows from `items` (typed array) or `data` (resolver-supplied alias). Per-row buttons ' +
      'come from declarative `actions: QueueAction[]`; the runtime wires `onAction(actionId, item)` ' +
      'to dispatch through the action registry. Supports grouping via `groupBy` + `groupLabels` + ' +
      '`groupOrder`. Replaces the per-host DecisionQueue/TaskQueue/IssueQueue customs the demos used ' +
      'to ship.',
    allowed_props: {
      items: 'array',
      data: 'unknown',
      title: 'string',
      actions: 'array',
      onAction: 'function',
      renderItem: 'function',
      idOf: 'function',
      groupBy: 'function',
      groupLabels: 'object',
      groupOrder: 'array',
      optimisticHide: 'boolean',
      density: 'string',
      variant: 'string',
      className: 'string',
      animateRowAppear: 'boolean',
      selectable: 'boolean',
      selectedIds: 'object',
      onSelectionChange: 'function',
      bulkActions: 'array',
      onBulkAction: 'function',
      showPinnedSeparator: 'boolean',
      pinnedSeparatorVariant: 'string',
      pinAriaLabel: 'function',
      pinIcon: 'unknown',
    },
  },
};
