// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useViewState()` — Wave 11 / Int-11.
 *
 * Per-route view-state middleware: a thin wrapper over `usePersistedState`
 * (Nav-2) keyed on `${routeKey}.view`. Hosts use it to remember the
 * shape-of-the-route — selected row(s), filter chips, sort key, the
 * currently-active saved-view tab — so that back-navigating from a
 * detail screen drops you exactly where you left off.
 *
 * Why a wrapper, not a re-export
 * ------------------------------
 * `usePersistedState` is the generic primitive (Sidebar collapse memory,
 * column visibility, theme, ...). `useViewState` adds two tiny constraints
 * that consistently come up in every "preserved view" feature:
 *
 *  1. The storage key is **always** namespaced by route. Without that
 *     discipline, `/inbox` and `/projects` would share a "selected" slot
 *     and back-nav would clobber each other. The `${routeKey}.view`
 *     suffix is the convention for the user-visible chunk of view state;
 *     `useScrollRestore` adopts the parallel `${routeKey}.scroll` key so
 *     the two never collide.
 *  2. The default scope is `'session'` — view state should NOT survive a
 *     full browser quit. Linear and Slack both reset view selection on a
 *     fresh launch but preserve it inside a session. Hosts that want
 *     longer durability opt into `'local'` or `'vault'`.
 *
 * Composing with Nav-2
 * --------------------
 * `<Sidebar storageKey="inbox">` (Nav-2) and `useViewState({ routeKey: …
 * })` cleanly coexist: their key namespaces (`inbox.collapsed`,
 * `inbox.expanded`, `${routeKey}.view`) never overlap. A single tab can
 * carry both shapes without cross-talk.
 *
 * SSR contract
 * ------------
 * Inherited from `usePersistedState`: returns `defaultValue` on the
 * server, reconciles to the persisted shape on the first client effect.
 * The rendered tree is identical pre- and post-hydration as long as the
 * default matches the SSR-time choice.
 */

import { usePersistedState, type PersistedSetter } from './use-persisted-state.js';

/** View-state scope. Mirrors `PersistedScope` for ergonomics at the call site. */
export type ViewStateScope = 'session' | 'local' | 'vault';

export interface UseViewStateOptions<T> {
  /**
   * Route identifier. Typically `pathname` (`/inbox/triage`) or a stable
   * surface key (`'inbox.triage'`). Hosts pick the granularity — a single
   * `routeKey` means a single view-state slot. Two surfaces with the
   * same `routeKey` deliberately share state.
   */
  routeKey: string;
  /**
   * Where to persist. Defaults to `'session'` — view state should reset on
   * a full browser quit, mirroring Linear / Slack. Use `'local'` for
   * long-lived per-route preferences (a "default sort" the user expects to
   * survive reboot) and `'vault'` for cross-device sync.
   */
  scope?: ViewStateScope;
  /** Initial value when no view state is persisted for `routeKey`. */
  defaultValue: T;
}

export type ViewStateSetter<T> = PersistedSetter<T>;

/**
 * Returns a per-route `[viewState, setViewState]` pair. The key is
 * `${routeKey}.view` so it never collides with `useScrollRestore`'s
 * `${routeKey}.scroll` slot — the two compose cleanly inside the same
 * route.
 */
export function useViewState<T>(opts: UseViewStateOptions<T>): [T, ViewStateSetter<T>] {
  const { routeKey, scope = 'session', defaultValue } = opts;
  return usePersistedState<T>({
    storageKey: `${routeKey}.view`,
    defaultValue,
    scope,
  });
}
