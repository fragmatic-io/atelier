// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `BlockKindRegistry` — Wave 11 / Cnt-6.
 *
 * The data model behind the slash-command menu (`<BlockMenu>`). Notion's `/`
 * picker, Linear's command-bar block insert, Coda's slash menu — every block
 * editor needs a list of "what kind of block can I insert here", scoped to
 * the surface that triggered the menu.
 *
 * Why a registry (not a static array):
 *  - Different surfaces want different block menus. A `'doc'` surface offers
 *    paragraph / heading / code / image / table; a `'chat'` surface offers
 *    paragraph / code / file; a `'comment'` surface offers paragraph + image
 *    only. Hosts add kinds with the surface filter, and `<BlockMenu surface>`
 *    asks for "everything visible to me".
 *  - The block menu's contents are dynamic. Plugins, AI providers (AI-2:
 *    `/summarize`, `/translate`), and per-workspace customisation all add
 *    block kinds at runtime. The registry is observable so the menu can
 *    re-render when its contents change.
 *
 * Structure mirrors `KeyboardRegistry` (Int-3) — the patterns Atelier
 * established for action discovery: `add` returns nothing (registration is
 * fire-and-forget at this layer; React adapters wrap with `useEffect` for
 * unregistration, see `<BlockMenu>`), `subscribe` returns an unsubscribe
 * function, and `list(surface)` filters in O(n).
 */

import type { IconRef } from '../icons/icon-ref.js';

/**
 * Context the host hands to a block kind's `insert` callback. Intentionally
 * loose — the editor model is host-defined (ProseMirror, Lexical, Slate,
 * a homegrown CRDT, …) and Atelier stays neutral on the shape. The two
 * fields we DO standardise are `surface` (so an insert handler can branch
 * on it — e.g. `summarize` may behave differently in `'doc'` vs `'chat'`)
 * and `position` (an opaque host token; the menu just hands it back so the
 * insert callback knows where the caret was when the user picked a kind).
 */
export interface BlockInsertContext {
  /** The surface that triggered the menu (e.g. `'doc'`, `'chat'`, `'comment'`). */
  surface: string;
  /** Where to place the block. Host-supplied; opaque to Atelier. */
  position: unknown;
}

/**
 * One block kind discoverable through the slash menu. The minimum viable
 * shape is `id` + `label` + `insert`; everything else is optional metadata
 * that helps the menu render a richer row (description, group, icon).
 */
export interface BlockKind {
  /** Stable identifier. Convention: `'<group>.<name>'` (e.g. `'text.heading-1'`). */
  id: string;
  /** Human-readable label rendered in the menu row. */
  label: string;
  /** Optional sub-label / hint shown beneath the label. */
  description?: string;
  /** Optional icon rendered to the left of the row. Resolved via `IconResolver`. */
  icon?: IconRef;
  /**
   * Optional group label — `'Text'`, `'Media'`, `'Embed'`, `'AI'`. Items with
   * the same `group` cluster under the same heading in the menu. Items with
   * no `group` render in a default un-headed cluster at the top.
   */
  group?: string;
  /**
   * Optional free-form keywords that improve fuzzy matching beyond `label` /
   * `description`. Case-insensitive. e.g. a `text.heading-1` block may carry
   * `['title', 'h1']` so typing either matches.
   */
  keywords?: readonly string[];
  /**
   * Insert handler. The menu calls this when the user picks the kind (or the
   * host calls `onInsert` directly — the callback is wired identically). The
   * editor uses `ctx.position` to place the new block; Atelier itself never
   * touches the document model.
   */
  insert: (ctx: BlockInsertContext) => void | Promise<void>;
}

/** Listener invoked whenever the registry's contents change. */
export type BlockKindRegistryListener = () => void;

/**
 * Read/write registry of block kinds, scoped per surface.
 *
 * The two-arg `add(kind, surface?)` shape lets callers register a kind for a
 * single surface (`add(textHeading1, 'doc')`) or for every surface (the
 * `surface` arg defaults to `'*'` — wildcard). `list(surface)` returns
 * everything explicitly bound to `surface` plus everything bound to `'*'`,
 * preserving registration order so author-supplied grouping is honoured.
 */
export interface BlockKindRegistry {
  /**
   * Register a `kind` against `surface` (or `'*'` for all surfaces). If a
   * kind with the same `id` is already registered against the same surface,
   * the later call overwrites the earlier one — last write wins, like
   * `KeyboardRegistry`.
   */
  add(kind: BlockKind, surface?: string): void;
  /**
   * List every kind visible to `surface`, in registration order: kinds
   * registered specifically for the surface, plus kinds registered for `'*'`.
   * Returns a frozen array for safe iteration.
   */
  list(surface: string): readonly BlockKind[];
  /**
   * Remove every registration of `id` (across all surfaces). Returns
   * silently when no such id exists — idempotent.
   */
  remove(id: string): void;
  /**
   * Subscribe to changes. Returns an unsubscribe function. The listener is
   * invoked synchronously after every `add` / `remove` mutation; subscribe
   * order is the call order.
   */
  subscribe(listener: BlockKindRegistryListener): () => void;
}

/** Sentinel surface meaning "visible to every surface". */
export const ALL_SURFACES = '*';

interface Entry {
  kind: BlockKind;
  surface: string;
}

/**
 * In-memory `BlockKindRegistry` backed by a single insertion-ordered list.
 * Adequate for every surface Atelier targets; persistence (per-workspace
 * customisations, plugin-defined kinds restored across reloads) is a host
 * concern handed to a wrapper.
 */
export class InMemoryBlockKindRegistry implements BlockKindRegistry {
  private readonly entries: Entry[] = [];
  private readonly listeners = new Set<BlockKindRegistryListener>();
  /**
   * Per-surface memoised result of `list()`. We invalidate on every
   * mutation. The cache is what makes `<BlockMenu>`'s `useSyncExternalStore`
   * snapshot stable — without it React would loop because `list()` would
   * return a fresh array on every render.
   */
  private readonly cache = new Map<string, readonly BlockKind[]>();

  add(kind: BlockKind, surface: string = ALL_SURFACES): void {
    // Last-write-wins on (id, surface). Walk the list in reverse so the
    // splice doesn't shift indexes for entries we still need to inspect.
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const entry = this.entries[i]!;
      if (entry.kind.id === kind.id && entry.surface === surface) {
        this.entries.splice(i, 1);
      }
    }
    this.entries.push({ kind, surface });
    this.cache.clear();
    this.notify();
  }

  list(surface: string): readonly BlockKind[] {
    const cached = this.cache.get(surface);
    if (cached) return cached;
    const out: BlockKind[] = [];
    const seen = new Set<string>();
    // Iterate in insertion order so author-supplied grouping is preserved.
    // The same kind id MAY appear once for `'*'` and once for a specific
    // surface; the surface-specific entry wins (later overrides earlier).
    for (const entry of this.entries) {
      if (entry.surface !== surface && entry.surface !== ALL_SURFACES) continue;
      // Drop any earlier output for the same id so the caller never sees
      // duplicates. `Array.findIndex` keeps insertion order.
      if (seen.has(entry.kind.id)) {
        const existing = out.findIndex((k) => k.id === entry.kind.id);
        if (existing !== -1) out.splice(existing, 1);
      }
      out.push(entry.kind);
      seen.add(entry.kind.id);
    }
    const frozen = Object.freeze(out);
    this.cache.set(surface, frozen);
    return frozen;
  }

  remove(id: string): void {
    let mutated = false;
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      if (this.entries[i]!.kind.id === id) {
        this.entries.splice(i, 1);
        mutated = true;
      }
    }
    if (mutated) {
      this.cache.clear();
      this.notify();
    }
  }

  subscribe(listener: BlockKindRegistryListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        // Same posture as KeyboardRegistry — never let a misbehaving
        // listener tear down the rest of the subscriber set.
        console.warn('[cir] BlockKindRegistry listener threw', err);
      }
    }
  }
}
