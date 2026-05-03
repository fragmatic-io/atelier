// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useScrollRestore()` — Wave 11 / Int-11.
 *
 * Records the `scrollTop` of a container and restores it when the
 * container remounts under the same `routeKey`. The companion to
 * `useViewState` for the user-visible shape of "where I was". Together,
 * back-navigating from a detail screen lands you on the same row, with
 * the same filter chips, at the same scroll position — the Linear/Slack
 * baseline.
 *
 * Storage shape
 * -------------
 * Keyed under `${routeKey}.scroll` via `usePersistedState` (Nav-2). This
 * deliberately parallels `useViewState`'s `${routeKey}.view` so both
 * hooks can target the same `routeKey` without collision. Default scope
 * is `'session'` — the same "reset on full quit" durability hosts expect
 * for view state.
 *
 * Why store on scroll, restore on mount
 * -------------------------------------
 * The DOM's own `scrollTo()` only works after the container is in the
 * tree AND has its content laid out. We restore inside an effect so the
 * user never sees a flash-to-top → snap-back. We persist on the
 * container's `scroll` event (passive listener) so back-nav after any
 * amount of scrolling is captured.
 *
 * SSR contract
 * ------------
 * No-op when `containerRef.current` is `null` (which it always is during
 * SSR / first render before the ref attaches). The first effect after
 * mount attaches the listener and restores the persisted top.
 *
 * Edge cases handled
 * ------------------
 *  - Container missing on mount: no listener attached, no restore. The
 *    next mount with a real ref will pick up the previously stored top.
 *  - Persisted top exceeds current `scrollHeight` (content shrunk):
 *    `scrollTo` clamps natively, so the container ends up at its max
 *    scroll position rather than throwing.
 *  - Multiple mounts per `routeKey` (e.g. tab switching): each new mount
 *    reads the latest stored value and the listener writes through.
 */

import { useEffect, useRef, type RefObject } from 'react';

import { usePersistedState } from './use-persisted-state.js';
import type { ViewStateScope } from './use-view-state.js';

export interface UseScrollRestoreOptions {
  /** Scrollable container. May be `null` until the ref attaches. */
  containerRef: RefObject<HTMLElement | null>;
  /** Route identifier — same shape as `useViewState`'s `routeKey`. */
  routeKey: string;
  /** Where to persist scroll. Defaults to `'session'`. */
  scope?: ViewStateScope;
}

/**
 * Wires `containerRef` so its `scrollTop` is recorded on scroll and
 * restored on remount. No render output; all work happens in effects.
 */
export function useScrollRestore(opts: UseScrollRestoreOptions): void {
  const { containerRef, routeKey, scope = 'session' } = opts;

  // The persisted slot lives next to `useViewState`'s `${routeKey}.view`
  // under `${routeKey}.scroll` so both hooks can share a `routeKey`.
  const [storedTop, setStoredTop] = usePersistedState<number>({
    storageKey: `${routeKey}.scroll`,
    defaultValue: 0,
    scope,
  });

  // Capture the latest stored value in a ref so the restore effect can
  // read it without re-running every time the value changes (which would
  // bounce the scroll position back on every scroll event we record).
  const storedTopRef = useRef<number>(storedTop);
  storedTopRef.current = storedTop;

  // Restore on mount + whenever the routeKey switches. We deliberately
  // depend on `routeKey` and `containerRef` only — re-restoring on every
  // setStoredTop write would defeat the recording loop.
  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const target = storedTopRef.current;
    if (target <= 0) return;
    // Use the imperative `scrollTop = …` assignment rather than
    // `scrollTo({ top, behavior: 'auto' })` — `scrollTo` with smooth
    // behavior animates and would visibly snap; `scrollTop = …` is
    // synchronous and paints in one frame.
    try {
      el.scrollTop = target;
    } catch {
      // Some virtual containers reject direct scrollTop assignment.
      // Best-effort — the user just lands at top, same as without the hook.
    }
    // `containerRef` identity is stable across renders by React contract,
    // so the dep array effectively means "run on routeKey change".
  }, [routeKey, containerRef]);

  // Record on scroll. Passive listener so we never block the scroll
  // pipeline. Re-attaches when `routeKey` changes so each mount writes
  // through to the right slot.
  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const onScroll = (): void => {
      setStoredTop(el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, [routeKey, containerRef, setStoredTop]);
}
