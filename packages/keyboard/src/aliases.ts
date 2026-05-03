// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Per-user alias overlay — Wave 11 / Int-7.
 *
 * Lets users rebind hotkeys without mutating the registry-author's
 * declaration. Each entry is an `actionId → hotkey-string` pair; the
 * `<KeyboardProvider>` consults the overlay when resolving a keydown so the
 * user's preference wins over the action's declared `hotkey`.
 *
 * ## Design notes
 *
 *  - **Pure logic, no React.** Hosts that wire persistence (vault scope,
 *    localStorage, cookie sync) wrap an `InMemoryAliasOverlay` and feed
 *    `set` / `clear` from their persistence layer. The React adapter
 *    (`<KeyboardProvider services={{ aliases }}>`) just consumes the
 *    interface.
 *
 *  - **Subscription model.** Same shape as the registry — `subscribe(fn)`
 *    fires after every mutation so the React provider re-renders with the
 *    new resolver behaviour. Keeps `useSyncExternalStore` integration
 *    trivial when we add an alias-editor UI later.
 *
 *  - **Format validation lives at the call site.** `set(actionId, hotkey)`
 *    accepts any string and parses it against `parseHotkey()`; an invalid
 *    hotkey throws so misuse fails loudly during the user's edit attempt
 *    rather than silently failing to bind at runtime.
 *
 *  - **Aliases are advisory.** When an alias references a hotkey that does
 *    not parse, the overlay refuses to store it. When an alias collides
 *    with another action's hotkey, the registry's last-write-wins resolve
 *    rule applies — users can shadow built-in bindings deliberately.
 */

import { parseHotkey } from './hotkey.js';

/**
 * Snapshot mutator + subscription contract. Tiny on purpose — the runtime
 * surface is `get(actionId)` (called once per resolved action) and
 * `subscribe(fn)` (called once by the React adapter).
 */
export interface AliasOverlay {
  /**
   * Returns the user's hotkey override for `actionId`, or `undefined` when
   * no alias is set. The returned string is the raw hotkey input the user
   * provided — callers parse via `parseHotkey()`.
   */
  get(actionId: string): string | undefined;
  /**
   * Set the alias for `actionId` to `hotkey`. The hotkey is parsed eagerly;
   * malformed input throws. Re-setting overwrites the prior alias.
   */
  set(actionId: string, hotkey: string): void;
  /** Remove the alias for `actionId`. No-op when no alias is set. */
  clear(actionId: string): void;
  /**
   * Returns a defensive snapshot of every alias. Hosts that persist the
   * overlay serialize this map. The returned object is read-only — mutate
   * via `set` / `clear`.
   */
  list(): Readonly<Record<string, string>>;
  /**
   * Subscribe to mutations. Fires synchronously after every `set` / `clear`
   * that actually changes state. Returns an unsubscribe thunk.
   */
  subscribe(listener: () => void): () => void;
}

/**
 * Default in-memory implementation. Hosts wrap it with persistence (see
 * `createPersistedAliasOverlay`) or substitute a custom one entirely.
 */
export class InMemoryAliasOverlay implements AliasOverlay {
  readonly #entries = new Map<string, string>();
  readonly #listeners = new Set<() => void>();
  // Snapshot cache — invalidated on mutation; rebuilt on next `list()` call.
  // Keeps reference identity stable for `useSyncExternalStore` consumers.
  #snapshot: Readonly<Record<string, string>> | null = null;

  /**
   * Create an overlay seeded with `initial` aliases. Useful for hydrating
   * from a persisted store (the persistence wrapper uses this) and for
   * tests that want a known starting point.
   */
  constructor(initial?: Readonly<Record<string, string>>) {
    if (initial !== undefined) {
      for (const [id, hotkey] of Object.entries(initial)) {
        // Validate seeded entries the same way as runtime `set` calls — a
        // corrupt persisted entry should be discarded silently rather than
        // crashing the host on mount.
        try {
          parseHotkey(hotkey);
          this.#entries.set(id, hotkey);
        } catch {
          // Drop the entry. Hosts that want strict-mode behaviour can pre-
          // validate the seed before passing it in.
        }
      }
    }
  }

  get(actionId: string): string | undefined {
    return this.#entries.get(actionId);
  }

  set(actionId: string, hotkey: string): void {
    // Eager parse — surfaces "you typed cmd+ instead of cmd+k" at the edit
    // moment, not when the user later presses the alias and nothing happens.
    parseHotkey(hotkey);
    const prior = this.#entries.get(actionId);
    if (prior === hotkey) return;
    this.#entries.set(actionId, hotkey);
    this.#snapshot = null;
    this.#notify();
  }

  clear(actionId: string): void {
    if (this.#entries.delete(actionId)) {
      this.#snapshot = null;
      this.#notify();
    }
  }

  list(): Readonly<Record<string, string>> {
    if (this.#snapshot !== null) return this.#snapshot;
    const out: Record<string, string> = {};
    for (const [id, hotkey] of this.#entries) {
      out[id] = hotkey;
    }
    this.#snapshot = Object.freeze(out);
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify(): void {
    // Snapshot the listener set so a listener that unsubscribes during
    // notification doesn't perturb the iteration (mirrors the registry).
    const listeners = Array.from(this.#listeners);
    for (const fn of listeners) {
      fn();
    }
  }
}

/**
 * Resolve the effective hotkey for an action: alias if present, declared
 * `hotkey` otherwise. Returned `undefined` means "no binding" (action is
 * palette-only or mouse-only) and the resolver should skip it.
 */
export function effectiveHotkey(
  actionId: string,
  declared: string | undefined,
  overlay: AliasOverlay | undefined,
): string | undefined {
  if (overlay !== undefined) {
    const alias = overlay.get(actionId);
    if (alias !== undefined) return alias;
  }
  return declared;
}
