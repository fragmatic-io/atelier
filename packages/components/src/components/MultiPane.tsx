// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * MultiPane — Wave 11 / Nav-1.
 *
 * Multi-pane (3+) layout primitive. The existing `<Split>` is fixed at 2
 * children with a single drag handle; `<MultiPane>` generalises to N panes,
 * each with its own min/max/collapsible spec, and persists size + collapse
 * state via the same `localStorage` shape `<Sidebar>` (Nav-2) uses.
 *
 * Why a separate primitive
 * ------------------------
 * The reference workflows we explicitly target — Slack (sidebar / main /
 * thread), Discord (servers / channels / main / members), Linear (filters
 * / list / detail) — all need 3+ panes with independent persistence
 * semantics per pane: thread is collapsible, channel-list isn't; members
 * has its own width memory; the inter-pane handles need their own min /
 * max clamps. Cramming that on `<Split>` would either (a) break its
 * tuple-of-two contract and the manifest rule that bounds it to 2 children,
 * or (b) force every host to nest two `<Split>`s and lose per-pane
 * persistence as the host re-renders. A first-class N-pane primitive is
 * the smaller surface.
 *
 * Sizing model
 * ------------
 * Sizes are tracked in **pixels**, one entry per pane, and laid out via
 * CSS grid (`grid-template-columns` for horizontal, `grid-template-rows`
 * for vertical). A 6 px drag handle sits between every consecutive non-
 * collapsed pair. Dragging handle `i` resizes pane `i` against pane
 * `i+1` — the delta is added to one and subtracted from the other so the
 * pair conserves their combined width. Each pane's `minSize` / `maxSize`
 * (also in px; defaulting to `120` / `Number.POSITIVE_INFINITY`) clamps
 * the pair simultaneously so the user never drags either side past its
 * limit.
 *
 * The pixel choice (vs. percentages used by `<Split>`) is deliberate:
 *  - Pane min/max constraints are typically expressed in px (chat-thread
 *    "at least 280", member-list "at most 360"). Forcing percentages
 *    would require translating a px ceiling into a screen-relative
 *    fraction at every render.
 *  - Persisted sizes survive container resize without snapping; a 280 px
 *    sidebar stays 280 px when the window grows. Hosts that want
 *    proportional behaviour can wrap the component in a flex layout with
 *    a known total or back the `defaultSize` off `window.innerWidth`.
 *  - The "remaining" pane (last non-collapsed) is allowed to flex via
 *    `1fr` so the row always fills the container even when the persisted
 *    sizes don't sum to the actual width — no horizontal scroll on
 *    resize.
 *
 * Collapse model
 * --------------
 * A `collapsible: true` pane gets a "rail" — a 28 px sliver pinned to the
 * pane's outer edge that, when clicked, restores it. While collapsed the
 * pane's content is hidden via `display: none` (so descendant focus,
 * timers, and selection state survive) and the matching drag handle is
 * also hidden. The rail itself participates in the grid as a fixed-width
 * column / row so the sibling layout stays stable.
 *
 * Persistence
 * -----------
 * `storageKey` namespaces two `localStorage` keys, mirroring `<Sidebar>`:
 *  - `${storageKey}.sizes`     — `Record<paneId, number>` (px per pane).
 *  - `${storageKey}.collapsed` — `Record<paneId, boolean>`.
 *
 * Both are JSON-typed; the existing `readPersistedJson` /
 * `writePersistedJson` helpers (`@atelier/components/lib/persisted-state`)
 * back the round-trip. The component stays free of an `@atelier/react`
 * runtime dep — same trade `<Sidebar>` makes — and hosts that want vault
 * persistence reach for `usePersistedState` from `@atelier/react` themselves.
 *
 * Controlled override
 * -------------------
 * Like every Atelier baseline primitive, `MultiPane` is uncontrolled by
 * default but exposes `onResize` / `onCollapseChange` callbacks for
 * hosts that want to mirror state into their own store. Persistence
 * fires regardless when `storageKey` is set — the persisted snapshot is
 * the user-experienced source of truth.
 *
 * Manifest contract
 * -----------------
 * The composition-rules entry is `{ can_contain: '*', min_children: 2 }`.
 * Two children is the practical floor (one would degenerate to a single
 * pane); the upper bound is open. Manifest authors typically wire 3 or 4.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { readPersistedJson, writePersistedJson } from '../lib/persisted-state.js';

export type MultiPaneDirection = 'horizontal' | 'vertical';

export interface PaneSpec {
  /** Stable id — drives persistence keying. Must be unique within `panes`. */
  id: string;
  /**
   * Human-readable label. Surfaces in the rail's title attribute and the
   * collapse-toggle's aria-label. When omitted, the rail renders with the
   * id as a fallback (still legible if hosts use semantic ids like `'sidebar'`).
   */
  label?: string;
  /** Initial size in px (along the active axis). Defaults to `240`. */
  defaultSize?: number;
  /** Hard floor in px — drag is clamped so the pane cannot shrink below this. Defaults to `120`. */
  minSize?: number;
  /** Hard ceiling in px — drag is clamped so the pane cannot grow above this. Defaults to no ceiling. */
  maxSize?: number;
  /**
   * When `true`, a rail toggle renders on the pane's outer edge that
   * collapses the pane to a 28 px sliver. Default `false`.
   */
  collapsible?: boolean;
  /** Initial collapse state when `collapsible` is `true`. Default `false`. */
  defaultCollapsed?: boolean;
  /** Pane content. */
  pane: ReactNode;
}

export interface MultiPaneProps {
  panes: readonly PaneSpec[];
  /** Layout axis. Defaults to `'horizontal'`. */
  direction?: MultiPaneDirection;
  /**
   * Namespaced persistence key. When set, `${key}.sizes` and
   * `${key}.collapsed` are read on mount and written on every drag /
   * collapse toggle. When `undefined`, the component is purely in-memory.
   */
  storageKey?: string;
  /**
   * Fires after every drag, with the next per-pane size map (px). Useful
   * for hosts that mirror state into their own store; persistence still
   * fires independently when `storageKey` is set.
   */
  onResize?: (sizes: Readonly<Record<string, number>>) => void;
  /** Fires after every collapse toggle with the next per-pane collapsed map. */
  onCollapseChange?: (collapsed: Readonly<Record<string, boolean>>) => void;
  className?: string;
}

const DEFAULT_PANE_SIZE = 240;
const DEFAULT_MIN_SIZE = 120;
const HANDLE_THICKNESS = 6;
const RAIL_THICKNESS = 28;

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function initialSizes(panes: readonly PaneSpec[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of panes) {
    out[p.id] = p.defaultSize ?? DEFAULT_PANE_SIZE;
  }
  return out;
}

function initialCollapsed(panes: readonly PaneSpec[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of panes) {
    out[p.id] = p.collapsible === true && p.defaultCollapsed === true;
  }
  return out;
}

function mergeSizes(
  panes: readonly PaneSpec[],
  persisted: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of panes) {
    const stored = persisted[p.id];
    out[p.id] = typeof stored === 'number' && stored > 0 ? stored : (p.defaultSize ?? DEFAULT_PANE_SIZE);
  }
  return out;
}

function mergeCollapsed(
  panes: readonly PaneSpec[],
  persisted: Record<string, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of panes) {
    const stored = persisted[p.id];
    if (typeof stored === 'boolean' && p.collapsible === true) {
      out[p.id] = stored;
    } else {
      out[p.id] = p.collapsible === true && p.defaultCollapsed === true;
    }
  }
  return out;
}

interface StorageKeys {
  sizes: string;
  collapsed: string;
}

function resolveStorageKeys(storageKey: string | undefined): StorageKeys | null {
  if (storageKey === undefined) return null;
  return { sizes: `${storageKey}.sizes`, collapsed: `${storageKey}.collapsed` };
}

export function MultiPane({
  panes,
  direction = 'horizontal',
  storageKey,
  onResize,
  onCollapseChange,
  className,
}: MultiPaneProps): ReactNode {
  const storage = resolveStorageKeys(storageKey);

  // Lazy initialisers: persisted snapshot wins, falling back to the
  // declared `defaultSize` / `defaultCollapsed`. Done once per mount so
  // we don't repeat the storage hit on every render.
  const [sizes, setSizes] = useState<Record<string, number>>(() => {
    if (storage === null) return initialSizes(panes);
    const persisted = readPersistedJson<Record<string, number>>(storage.sizes, {});
    return mergeSizes(panes, persisted);
  });

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (storage === null) return initialCollapsed(panes);
    const persisted = readPersistedJson<Record<string, boolean>>(storage.collapsed, {});
    return mergeCollapsed(panes, persisted);
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  // Dragging state — the active handle index plus the starting pointer
  // offset and the snapshot of the two affected pane sizes. Refs (not
  // useState) so a pointermove fires immediately without a re-render in
  // between to install the new value.
  const dragRef = useRef<
    | {
        leftId: string;
        rightId: string;
        startCoord: number;
        startLeft: number;
        startRight: number;
      }
    | null
  >(null);

  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const onCollapseChangeRef = useRef(onCollapseChange);
  onCollapseChangeRef.current = onCollapseChange;

  // Re-merge when the panes list itself changes (panes added / removed at
  // runtime). Persisted entries for removed panes are dropped lazily on
  // the next write.
  useEffect(() => {
    setSizes((prev) => {
      const next: Record<string, number> = {};
      for (const p of panes) {
        const v = prev[p.id];
        next[p.id] = typeof v === 'number' && v > 0 ? v : (p.defaultSize ?? DEFAULT_PANE_SIZE);
      }
      return next;
    });
    setCollapsed((prev) => {
      const next: Record<string, boolean> = {};
      for (const p of panes) {
        const v = prev[p.id];
        if (typeof v === 'boolean' && p.collapsible === true) next[p.id] = v;
        else next[p.id] = p.collapsible === true && p.defaultCollapsed === true;
      }
      return next;
    });
    // Re-merging on `panes` reference change covers the practical cases
    // (adding/removing a pane); deep-equality scanning would be wasted
    // work for the common hot path where the array identity is stable.
  }, [panes]);

  const persistSizes = useCallback(
    (next: Record<string, number>): void => {
      if (storage !== null) writePersistedJson(storage.sizes, next);
      onResizeRef.current?.(next);
    },
    [storage?.sizes],
  );

  const persistCollapsed = useCallback(
    (next: Record<string, boolean>): void => {
      if (storage !== null) writePersistedJson(storage.collapsed, next);
      onCollapseChangeRef.current?.(next);
    },
    [storage?.collapsed],
  );

  const toggleCollapsed = useCallback(
    (id: string): void => {
      setCollapsed((prev) => {
        const next = { ...prev, [id]: !prev[id] };
        persistCollapsed(next);
        return next;
      });
    },
    [persistCollapsed],
  );

  // ---------------------------------------------------------------------------
  // Drag handlers
  // ---------------------------------------------------------------------------

  const onPointerDown = (
    e: PointerEvent<HTMLDivElement>,
    leftId: string,
    rightId: string,
  ): void => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      leftId,
      rightId,
      startCoord: direction === 'horizontal' ? e.clientX : e.clientY,
      startLeft: sizes[leftId] ?? DEFAULT_PANE_SIZE,
      startRight: sizes[rightId] ?? DEFAULT_PANE_SIZE,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const coord = direction === 'horizontal' ? e.clientX : e.clientY;
    const delta = coord - drag.startCoord;

    const leftSpec = panes.find((p) => p.id === drag.leftId);
    const rightSpec = panes.find((p) => p.id === drag.rightId);
    if (!leftSpec || !rightSpec) return;

    const leftMin = leftSpec.minSize ?? DEFAULT_MIN_SIZE;
    const leftMax = leftSpec.maxSize ?? Number.POSITIVE_INFINITY;
    const rightMin = rightSpec.minSize ?? DEFAULT_MIN_SIZE;
    const rightMax = rightSpec.maxSize ?? Number.POSITIVE_INFINITY;

    // Clamp delta so neither pane crosses its bounds. The pair conserves
    // total width: left += delta, right -= delta.
    let nextLeft = drag.startLeft + delta;
    let nextRight = drag.startRight - delta;

    if (nextLeft < leftMin) {
      nextRight -= leftMin - nextLeft;
      nextLeft = leftMin;
    }
    if (nextLeft > leftMax) {
      nextRight += nextLeft - leftMax;
      nextLeft = leftMax;
    }
    if (nextRight < rightMin) {
      nextLeft -= rightMin - nextRight;
      nextRight = rightMin;
    }
    if (nextRight > rightMax) {
      nextLeft += nextRight - rightMax;
      nextRight = rightMax;
    }

    nextLeft = clamp(nextLeft, leftMin, leftMax);
    nextRight = clamp(nextRight, rightMin, rightMax);

    setSizes((prev) => {
      const next = { ...prev, [drag.leftId]: nextLeft, [drag.rightId]: nextRight };
      persistSizes(next);
      return next;
    });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // ---------------------------------------------------------------------------
  // Layout — build a CSS grid template that walks panes + handles + rails.
  // The last non-collapsed pane gets `1fr` so the row fills the container.
  // ---------------------------------------------------------------------------

  const visibleIndices: number[] = [];
  panes.forEach((p, i) => {
    if (collapsed[p.id] !== true) visibleIndices.push(i);
  });
  const lastVisible = visibleIndices[visibleIndices.length - 1] ?? -1;

  // Track for each pane: its grid template segment (size + handle/rail
  // sentinels are interleaved). We also remember the index ordering so
  // child rendering matches.
  const segments: string[] = [];
  type ChildSlot =
    | { kind: 'pane'; pane: PaneSpec }
    | { kind: 'rail'; pane: PaneSpec }
    | { kind: 'handle'; leftId: string; rightId: string };
  const slots: ChildSlot[] = [];

  for (let i = 0; i < panes.length; i += 1) {
    const p = panes[i]!;
    const isCollapsed = collapsed[p.id] === true;
    if (isCollapsed) {
      // Render a rail instead of the pane — fixed thickness, click-to-restore.
      segments.push(`${String(RAIL_THICKNESS)}px`);
      slots.push({ kind: 'rail', pane: p });
    } else {
      const size = sizes[p.id] ?? p.defaultSize ?? DEFAULT_PANE_SIZE;
      // Last visible pane flexes so the row fills the container even when
      // persisted sizes don't sum to the live width.
      const isLastVisible = i === lastVisible;
      segments.push(isLastVisible ? '1fr' : `${String(size)}px`);
      slots.push({ kind: 'pane', pane: p });
    }
    // A handle goes between consecutive non-collapsed panes. We add one
    // when the current pane is non-collapsed AND the next non-collapsed
    // pane exists at i+1, i+2, … etc. — but only between immediate
    // grid-adjacent non-collapsed pairs. To keep things simple, we add a
    // handle when the next pane in the array is also non-collapsed.
    const next = panes[i + 1];
    if (next !== undefined && !isCollapsed && collapsed[next.id] !== true) {
      segments.push(`${String(HANDLE_THICKNESS)}px`);
      slots.push({ kind: 'handle', leftId: p.id, rightId: next.id });
    }
  }

  const gridStyle =
    direction === 'horizontal'
      ? { gridTemplateColumns: segments.join(' ') }
      : { gridTemplateRows: segments.join(' ') };

  return (
    <div
      ref={containerRef}
      data-cir-component="MultiPane"
      data-direction={direction}
      data-pane-count={String(panes.length)}
      className={className}
      style={{
        display: 'grid',
        width: '100%',
        height: '100%',
        ...gridStyle,
      }}
    >
      {slots.map((slot, idx) => {
        if (slot.kind === 'pane') {
          const p = slot.pane;
          const collapseControl = p.collapsible === true ? (
            <button
              type="button"
              data-cir-part="multipane-collapse"
              data-pane={p.id}
              aria-label={`Collapse ${p.label ?? p.id}`}
              onClick={() => {
                toggleCollapsed(p.id);
              }}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1,
                padding: 2,
              }}
            >
              {direction === 'horizontal' ? '◀' : '▲'}
            </button>
          ) : null;
          return (
            <div
              key={`pane-${p.id}`}
              data-cir-part="multipane-pane"
              data-pane={p.id}
              data-pane-index={String(idx)}
              data-collapsed="false"
              style={{ position: 'relative', overflow: 'hidden', minWidth: 0, minHeight: 0 }}
            >
              {collapseControl}
              {p.pane}
            </div>
          );
        }
        if (slot.kind === 'rail') {
          const p = slot.pane;
          return (
            <button
              key={`rail-${p.id}`}
              type="button"
              data-cir-part="multipane-rail"
              data-pane={p.id}
              data-collapsed="true"
              aria-label={`Expand ${p.label ?? p.id}`}
              title={p.label ?? p.id}
              onClick={() => {
                toggleCollapsed(p.id);
              }}
              style={{
                background: 'rgba(0,0,0,0.04)',
                border: 0,
                cursor: 'pointer',
                writingMode: direction === 'horizontal' ? 'vertical-rl' : undefined,
                padding: 4,
                fontSize: 12,
              }}
            >
              {direction === 'horizontal' ? '▶' : '▼'}
            </button>
          );
        }
        // handle
        return (
          <div
            key={`handle-${slot.leftId}-${slot.rightId}`}
            role="separator"
            aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
            data-cir-part="multipane-handle"
            data-left={slot.leftId}
            data-right={slot.rightId}
            tabIndex={0}
            onPointerDown={(e) => {
              onPointerDown(e, slot.leftId, slot.rightId);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
              background: 'rgba(0,0,0,0.1)',
              touchAction: 'none',
            }}
          />
        );
      })}
    </div>
  );
}

MultiPane.displayName = 'MultiPane';

export function multiPaneTextRender(props: MultiPaneProps): string {
  const ids = props.panes.map((p) => p.label ?? p.id).join(' / ');
  return `[MultiPane ${props.direction ?? 'horizontal'}: ${ids}]`;
}

export const MultiPaneBinding: ComponentBinding = {
  id: 'MultiPane',
  factory: MultiPane,
};
