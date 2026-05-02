// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `KeyboardRegistry` — Wave 11 / Int-3.
 *
 * The marketplace primitive for "things the user can do via the keyboard".
 * Every CIR capability becomes (or can become) a `KeyboardAction`; the
 * registry is the lookup that powers Cmd+K, Cmd+P (Int-6), chord shortcuts
 * (Int-7), and settings search (Int-12).
 *
 * ## Design notes
 *
 *  - **Pure logic, no React.** Hosts can drive the registry from non-React
 *    code (Electron menus, native menus, Storybook). The React adapter
 *    (`@cir/react`'s `<KeyboardProvider>` + `useKeyboardAction`) wraps
 *    `register()` with hook lifecycle.
 *  - **Subscription model.** `subscribe(listener)` lets the React provider
 *    re-render whenever actions change. Subscribers run synchronously after
 *    every mutation; the React hook routes through `useSyncExternalStore`.
 *  - **Insertion order is preserved** for `list()`. Recency / fuzzy weights
 *    are layered ON TOP via `ActionRecencyTracker.weight(id)` — the registry
 *    itself stays neutral.
 *  - **Hotkey collisions are not silently swallowed.** When two actions
 *    bind the same hotkey, the LATER registration wins and the earlier one
 *    keeps its label but loses its hotkey at resolve time. (Hosts that need
 *    strict failure can wrap `register()` and consult `resolve()` first.)
 *  - **Scopes are advisory.** `'global'` actions fire from any page;
 *    `'route'` actions disappear when their owner unmounts. The registry
 *    itself doesn't implement route detection — the React provider tears
 *    down `route`-scoped actions when the consuming hook unmounts.
 */

import {
  matchHotkey,
  parseHotkey,
  type HotkeyEventLike,
  type ParsedHotkey,
  type Platform,
} from './hotkey.js';

/**
 * A single keyboard-invocable action. Mirrors a CIR capability shape closely
 * (an `id`, a human label, optional metadata) so the runtime can register
 * one `KeyboardAction` per capability.
 */
export interface KeyboardAction {
  /**
   * Stable identifier. Convention: dotted lowercase (e.g.
   * `'thread.archive'`, `'palette.open'`, `'nav.home'`). Two registrations
   * with the same id replace each other (last write wins).
   */
  id: string;
  /** Human-readable label rendered in the palette. */
  label: string;
  /** Optional sub-label / hint shown beneath the label. */
  description?: string;
  /**
   * Optional hotkey string in the parser's syntax (`'cmd+k'`, `'g i'`,
   * `'shift+escape'`). Omit when the action is palette-only / mouse-only.
   */
  hotkey?: string;
  /**
   * `'global'` — registered for the lifetime of the host (default).
   * `'route'` — owned by the currently mounted React subtree; unregisters
   *  when the consuming `useKeyboardAction` hook unmounts.
   *
   * The registry itself does not enforce scope semantics — the React
   * adapter does — but `list(scope)` lets palettes filter on it.
   */
  scope?: 'global' | 'route';
  /**
   * Logical grouping for palette rendering ("Navigation", "Actions",
   * "View"). Free-form; the palette groups visually by exact match.
   */
  group?: string;
  /**
   * Optional icon name (kebab-case lucide name) consumed by the palette via
   * the `IconResolver` context (Vis-3). Set IDs other than the default
   * (`'lucide'`) are an Int-7+ concern.
   */
  icon?: string;
  /**
   * Free-form keywords that improve fuzzy matching ("delete" for
   * "thread.archive", "go to inbox" for "nav.inbox").
   */
  keywords?: readonly string[];
  /**
   * Invoked by the resolver when the hotkey matches OR by the palette when
   * the user picks the action. May be sync or async; rejections surface as
   * audit events at the runtime layer (the registry itself is neutral).
   */
  invoke: () => void | Promise<void>;
}

/**
 * Snapshot of a registered action with its parsed hotkey memoized. The
 * registry caches parses so the keydown loop never re-parses on hot paths.
 */
interface RegisteredAction {
  action: KeyboardAction;
  hotkey: ParsedHotkey | null;
}

/** Listener invoked synchronously after each mutation. */
export type KeyboardRegistryListener = () => void;

export interface KeyboardRegistry {
  /**
   * Register an action. Returns an `unregister()` thunk; calling it removes
   * the action by `id`. Re-registering with the same id replaces the entry
   * in place (insertion order preserved).
   */
  register(action: KeyboardAction): () => void;
  /**
   * Remove an action by id. No-op if the id is not registered. Provided
   * separately from `unregister()` for hosts that want imperative cleanup.
   */
  unregister(id: string): void;
  /**
   * Return all currently-registered actions in registration order. Pass a
   * scope to filter; pass nothing to get everything.
   */
  list(scope?: 'global' | 'route'): readonly KeyboardAction[];
  /**
   * Resolve the given hotkey-shaped event to the most-recently-registered
   * action that matches. Returns `null` when nothing matches (the React
   * provider treats this as "let the event continue").
   */
  resolve(event: HotkeyEventLike, platform?: Platform): KeyboardAction | null;
  /**
   * Subscribe to mutation events. Returns an unsubscribe thunk. Used by the
   * React provider's `useSyncExternalStore` integration.
   */
  subscribe(listener: KeyboardRegistryListener): () => void;
}

/**
 * In-memory registry. Insertion order is preserved via a `Map<string, …>`;
 * mutation listeners fire synchronously after each register / unregister.
 *
 * The registry caches per-scope snapshots so `list(scope)` returns the same
 * array reference until a mutation happens. This is critical for the React
 * adapter's `useSyncExternalStore` integration — without a stable snapshot,
 * the consumer would re-render in an infinite loop.
 */
export class InMemoryKeyboardRegistry implements KeyboardRegistry {
  readonly #entries = new Map<string, RegisteredAction>();
  readonly #listeners = new Set<KeyboardRegistryListener>();
  // Snapshot cache. Each key represents the scope filter (`'all'` →
  // `list()` with no arg). Cached arrays are invalidated on any mutation;
  // subsequent reads rebuild once and reuse the same reference.
  readonly #snapshots = new Map<'all' | 'global' | 'route', readonly KeyboardAction[]>();

  register(action: KeyboardAction): () => void {
    const parsed = action.hotkey !== undefined ? parseHotkey(action.hotkey) : null;
    this.#entries.set(action.id, { action, hotkey: parsed });
    this.#snapshots.clear();
    this.#notify();
    return () => {
      // Only unregister when the entry currently in the map is the one we
      // registered — re-registering with the same id should not be undone
      // by an old returned thunk.
      const current = this.#entries.get(action.id);
      if (current && current.action === action) {
        this.#entries.delete(action.id);
        this.#snapshots.clear();
        this.#notify();
      }
    };
  }

  unregister(id: string): void {
    if (this.#entries.delete(id)) {
      this.#snapshots.clear();
      this.#notify();
    }
  }

  list(scope?: 'global' | 'route'): readonly KeyboardAction[] {
    const key = scope ?? 'all';
    const cached = this.#snapshots.get(key);
    if (cached) return cached;
    const out: KeyboardAction[] = [];
    for (const entry of this.#entries.values()) {
      const actionScope = entry.action.scope ?? 'global';
      if (scope === undefined || actionScope === scope) {
        out.push(entry.action);
      }
    }
    const frozen = Object.freeze(out);
    this.#snapshots.set(key, frozen);
    return frozen;
  }

  resolve(event: HotkeyEventLike, platform?: Platform): KeyboardAction | null {
    // Iterate in REVERSE insertion order so the most-recently-registered
    // action wins on collisions (e.g. a route-scoped binding overlaying a
    // global default). Map iterators don't reverse natively; pull entries
    // and walk them backwards.
    const all = Array.from(this.#entries.values());
    for (let i = all.length - 1; i >= 0; i--) {
      const entry = all[i] as RegisteredAction;
      if (entry.hotkey === null) continue;
      if (matchHotkey(entry.hotkey, event, platform)) {
        return entry.action;
      }
    }
    return null;
  }

  subscribe(listener: KeyboardRegistryListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify(): void {
    // Snapshot the listener set so a listener that unsubscribes during
    // notification doesn't perturb the iteration.
    const listeners = Array.from(this.#listeners);
    for (const fn of listeners) {
      fn();
    }
  }
}
