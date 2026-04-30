// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * `useMultiSelect()` — stateful hook for hosts to wire `<List>` / `<Table>` /
 * `<Grid>` selection.
 *
 * The hook owns a `Set<TId>` of selected ids and exposes the canonical
 * primitives: `toggle`, `selectRange`, `selectAll`, `clear`, plus an
 * `isSelected` predicate. State is held in a React `useState` so consumers
 * re-render on every change.
 *
 * Keyboard wiring is opt-in via `bind(rootEl)`: pass a list-root DOM node
 * and the hook installs `keydown` listeners that forward `Cmd/Ctrl+A`
 * (`selectAll`) and `Esc` (`clear`). The listener attaches to the
 * `document` so the shortcuts fire even when the focused element is a
 * checkbox or a button inside the list (those buttons usually swallow
 * `keydown` for their own use). The `bind` call returns its own cleanup;
 * hosts call it from a `useEffect` so it tears down on unmount.
 *
 * Pairs with `<BulkActionBar>` from `@cir/components` — the canonical
 * Wave 7b / track Int-9 selection surface.
 */

import { useCallback, useMemo, useState } from 'react';

export interface UseMultiSelectResult<TId extends string = string> {
  /** Read-only view of the current selection set. */
  selected: ReadonlySet<TId>;
  /** Returns true if `id` is in the selection set. */
  isSelected: (id: TId) => boolean;
  /** Add `id` if absent; remove if present. */
  toggle: (id: TId) => void;
  /**
   * Select every id between `from` and `to` (inclusive) in the order they
   * appear in `allIds`. Hosts pass `allIds` so the hook never has to know
   * about row order. `from` and `to` are NOT required to be adjacent.
   */
  selectRange: (from: TId, to: TId, allIds: readonly TId[]) => void;
  /** Replace the selection set with every id in `allIds`. */
  selectAll: (allIds: readonly TId[]) => void;
  /** Empty the selection set. */
  clear: () => void;
  /**
   * Wire `Cmd/Ctrl+A` (selectAll) and `Esc` (clear) to fire while the host's
   * list root is mounted. The handler attaches to `document` so it fires
   * regardless of which descendant currently has focus. Returns a cleanup
   * function — call it from the cleanup branch of a `useEffect`.
   *
   * `allIds` is read at the time of the keypress (not at bind time) via the
   * supplied getter, so hosts whose list contents change between renders
   * never select stale rows.
   */
  bind: (allIdsGetter: () => readonly TId[]) => () => void;
}

/**
 * Stateful hook for multi-select. `TId` defaults to `string` so most hosts
 * can call it as `useMultiSelect()`; lists keyed on a domain-specific id
 * union can pass that as the type parameter for stronger typing.
 */
export function useMultiSelect<TId extends string = string>(): UseMultiSelectResult<TId> {
  const [selected, setSelected] = useState<ReadonlySet<TId>>(() => new Set<TId>());

  const isSelected = useCallback(
    (id: TId): boolean => {
      return selected.has(id);
    },
    [selected],
  );

  const toggle = useCallback((id: TId): void => {
    setSelected((prev) => {
      const next = new Set<TId>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectRange = useCallback((from: TId, to: TId, allIds: readonly TId[]): void => {
    setSelected((prev) => {
      const next = new Set<TId>(prev);
      const fromIdx = allIds.indexOf(from);
      const toIdx = allIds.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) {
        // Either anchor is missing — leave selection untouched. Hosts that
        // pass a stale anchor (e.g. a row removed mid-flight) get a safe
        // no-op rather than a silent partial selection.
        return prev;
      }
      const lo = Math.min(fromIdx, toIdx);
      const hi = Math.max(fromIdx, toIdx);
      for (let i = lo; i <= hi; i++) {
        const id = allIds[i];
        if (id !== undefined) next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((allIds: readonly TId[]): void => {
    setSelected(new Set<TId>(allIds));
  }, []);

  const clear = useCallback((): void => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set<TId>()));
  }, []);

  const bind = useCallback(
    (allIdsGetter: () => readonly TId[]): (() => void) => {
      if (typeof document === 'undefined') {
        return (): void => {
          /* noop in SSR */
        };
      }
      const onKey = (e: KeyboardEvent): void => {
        // Cmd+A on macOS, Ctrl+A on Windows/Linux. We only intercept when no
        // other modifier is held so we don't trample browser shortcuts like
        // Cmd+Shift+A (re-open last tab on Chrome).
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') {
          // Only intercept when the focused element is NOT a text input — a
          // selection-all in a search box should still go to the input.
          const target = e.target as HTMLElement | null;
          const tag = target?.tagName ?? '';
          const editable =
            tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable === true;
          if (editable) return;
          e.preventDefault();
          selectAll(allIdsGetter());
          return;
        }
        if (e.key === 'Escape') {
          // Don't preventDefault — hosts may also bind Esc to close a
          // modal/drawer above us. Clearing selection is a side-effect that
          // never blocks other handlers from running.
          clear();
        }
      };
      document.addEventListener('keydown', onKey);
      return (): void => {
        document.removeEventListener('keydown', onKey);
      };
    },
    [selectAll, clear],
  );

  return useMemo<UseMultiSelectResult<TId>>(
    () => ({ selected, isSelected, toggle, selectRange, selectAll, clear, bind }),
    [selected, isSelected, toggle, selectRange, selectAll, clear, bind],
  );
}
