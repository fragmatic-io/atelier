// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `QuickSwitchIndex` — Wave 11 / Int-6.
 *
 * The marketplace primitive for "things the user can navigate to". Where the
 * `KeyboardRegistry` (Int-3) catalogues *actions* ("do anything"), this
 * index catalogues *resources* ("go to anything"). Raycast / Arc / Linear
 * separate the two surfaces because the cognitive load of mixing a verb
 * ("archive thread") with a noun ("/settings/intent") in a single fuzzy
 * list is real — Cmd+K and Cmd+P are the canonical split.
 *
 * ## Design notes
 *
 *  - **Pure logic, no React.** Mirrors `KeyboardRegistry` so hosts can drive
 *    the index from non-React code. The React adapter (`<QuickSwitcher>`)
 *    reads it via the components-local `KeyboardContext` (services bag
 *    augmented with `quickswitch`).
 *  - **Subscription model.** `subscribe(listener)` lets a React provider
 *    re-render whenever the index changes. Subscribers run synchronously
 *    after every mutation; the React hook routes through
 *    `useSyncExternalStore`.
 *  - **Insertion order is preserved** for `list()`. Recency / fuzzy weights
 *    are layered on top via `ActionRecencyTracker.weight(id)` — the index
 *    itself stays neutral.
 *  - **Last write wins per id.** Two `add()` calls with the same id
 *    replace each other in place, mirroring the keyboard registry's
 *    insertion-order semantics.
 *  - **Bulk operations.** `add(items)` and `remove(ids)` take arrays so
 *    hosts can swap a route's items in one mutation (one notify, one
 *    snapshot rebuild) instead of N.
 */

/**
 * A single resource the user can jump to. Mirrors the shape used by
 * `<QuickSwitcher>`; kept here so non-React hosts can construct items
 * without depending on `@atelier/components`.
 */
export interface QuickSwitchItem {
  /**
   * Stable identifier. Convention: dotted lowercase with the resource kind
   * as the first segment (e.g. `'route:/today'`, `'doc:abc-123'`,
   * `'project:atelier'`). Two `add()` calls with the same id replace each
   * other.
   */
  id: string;
  /** Human-readable label rendered in the switcher list. */
  label: string;
  /**
   * Optional resource kind — `'route'`, `'document'`, `'project'`, etc.
   * Free-form; the switcher renders an icon per `kind` via the host's
   * `IconResolver` and groups items visually by exact-match.
   */
  kind?: string;
  /**
   * Optional URL the host can navigate to on select. The switcher treats
   * this as advisory — `onSelect` is the canonical hook; `href` is a
   * convenience for hosts that mirror their resources to URLs.
   */
  href?: string;
  /** Optional sub-label / hint shown beneath the label. */
  description?: string;
  /**
   * Optional icon name (kebab-case lucide name) consumed by the switcher
   * via the `IconResolver` context (Vis-3). When absent, the switcher
   * falls back to a kind-derived default (e.g. `kind === 'route'` →
   * `'arrow-right'`). Set IDs other than the default (`'lucide'`) require
   * an explicit `{ set, name }` shape.
   */
  icon?: string;
  /**
   * Free-form keywords that improve fuzzy matching (`['inbox', 'todo']`
   * for a `/today` route).
   */
  keywords?: readonly string[];
}

/** Listener invoked synchronously after each mutation. */
export type QuickSwitchIndexListener = () => void;

export interface QuickSwitchIndex {
  /**
   * Add one or more items. Items with an id already in the index replace
   * the existing entry in place (insertion order preserved on replacement,
   * appended on first sight).
   */
  add(items: readonly QuickSwitchItem[]): void;
  /** Remove one or more items by id. Unknown ids are silently ignored. */
  remove(ids: readonly string[]): void;
  /** Returns all currently-indexed items in insertion order. */
  list(): readonly QuickSwitchItem[];
  /**
   * Subscribe to mutation events. Returns an unsubscribe thunk. Used by
   * the React provider's `useSyncExternalStore` integration.
   */
  subscribe(listener: QuickSwitchIndexListener): () => void;
}

/**
 * In-memory index. Insertion order is preserved via a `Map<string, …>`;
 * mutation listeners fire synchronously after each `add` / `remove`.
 *
 * The index caches its `list()` snapshot so consumers comparing via
 * `useSyncExternalStore` get a stable reference until the next mutation.
 */
export class InMemoryQuickSwitchIndex implements QuickSwitchIndex {
  readonly #entries = new Map<string, QuickSwitchItem>();
  readonly #listeners = new Set<QuickSwitchIndexListener>();
  #snapshot: readonly QuickSwitchItem[] | null = null;

  add(items: readonly QuickSwitchItem[]): void {
    if (items.length === 0) return;
    for (const item of items) {
      this.#entries.set(item.id, item);
    }
    this.#snapshot = null;
    this.#notify();
  }

  remove(ids: readonly string[]): void {
    if (ids.length === 0) return;
    let mutated = false;
    for (const id of ids) {
      if (this.#entries.delete(id)) mutated = true;
    }
    if (mutated) {
      this.#snapshot = null;
      this.#notify();
    }
  }

  list(): readonly QuickSwitchItem[] {
    if (this.#snapshot !== null) return this.#snapshot;
    const out: QuickSwitchItem[] = [];
    for (const item of this.#entries.values()) {
      out.push(item);
    }
    this.#snapshot = Object.freeze(out);
    return this.#snapshot;
  }

  subscribe(listener: QuickSwitchIndexListener): () => void {
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
