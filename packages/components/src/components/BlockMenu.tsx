// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `<BlockMenu>` — Wave 11 / Cnt-6.
 *
 * Notion's `/` menu, Linear's block-insert dropdown, Coda's slash picker —
 * the inline command palette scoped to "what kind of block do I want to
 * insert here". Where `<CommandPalette>` (Int-3) is global and discovers
 * keyboard actions, `<BlockMenu>` is editor-local and lists block KINDS for
 * a specific surface.
 *
 * Design choices that diverge from `<CommandPalette>`:
 *
 *  - **Anchored, not modal.** A slash menu floats next to the caret — host
 *    computes a viewport-anchor `{ top, left }` and hands it in as
 *    `anchorRect`. We render a plain `<div role="dialog">` (NOT `<dialog>`)
 *    so the host's editor keeps focus while the menu is open. The user
 *    keeps typing into the editor; the menu observes input via `query`
 *    plumbed back from a callback.
 *  - **Open / close fully controlled.** The host owns when the menu opens
 *    (typically: detect `'/'` insertion in the editor) and when it closes
 *    (`Escape`, blur, selection picked). We never auto-show.
 *  - **Surface-scoped registry.** The menu subscribes to the registry's
 *    `list(surface)` so plugins / AI providers (AI-2) that add kinds at
 *    runtime appear immediately. Re-renders piggyback on
 *    `useSyncExternalStore`.
 *  - **Tab autocompletes the group label.** Notion's keyboard ergonomic.
 *    When the current `query` matches a group prefix unambiguously (e.g.
 *    `'me'` → `'Media'`), pressing Tab rewrites the input to the full
 *    group label. Filtering keeps right on going from there.
 *
 * Keyboard contract:
 *   - ArrowDown / ArrowUp move the highlight (wraps).
 *   - Enter triggers the highlighted kind's `insert` (and the host
 *     `onInsert` callback) and closes the menu.
 *   - Escape closes the menu without inserting.
 *   - Tab autocompletes a unique group prefix into the input.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import type { BlockInsertContext, BlockKind, BlockKindRegistry } from '../blocks/registry.js';
import { Icon } from './Icon.js';
import { normalizeIconRef } from '../icons/icon-ref.js';
import { cn, blockMenuVariantClass, elevationClass, type BlockMenuVariant } from './_variants.js';

/** Default trigger character. The host detects this in its editor. */
export type BlockMenuTrigger = '/' | '@' | '#';

const EMPTY_KINDS: readonly BlockKind[] = Object.freeze([]);

export interface BlockMenuProps {
  /** Source of block kinds. Filtered by `surface` per render. */
  registry: BlockKindRegistry;
  /** Surface that owns the menu (e.g. `'doc'`, `'chat'`, `'comment'`). */
  surface: string;
  /**
   * Called when the user picks a kind. Atelier invokes the kind's own
   * `insert` first (so plugin authors can rely on it), then this callback
   * — host hosts use it to close the menu and / or move focus.
   */
  onInsert: (kind: BlockKind, ctx: BlockInsertContext) => void;
  /** Trigger character (default `'/'`). Surfaced via `data-cir-trigger`. */
  trigger?: BlockMenuTrigger;
  /**
   * Anchor coordinate (viewport-relative, host-computed). When omitted the
   * menu renders inline at its DOM position — useful for tests and for
   * hosts that wrap the menu in their own positioning container.
   */
  anchorRect?: { top: number; left: number };
  /** Opaque host token threaded through to `BlockInsertContext.position`. */
  position?: unknown;
  /** Whether the menu is open. Always required (controlled). */
  open: boolean;
  /** Called on Escape, outside-click, or after a successful insert. */
  onClose: () => void;
  /** Optional placeholder for the (otherwise hidden) search input. */
  placeholder?: string;
  /** Optional accessible label override. Defaults to `'Insert block'`. */
  ariaLabel?: string;
  variant?: BlockMenuVariant;
  className?: string;
}

interface ScoredKind {
  kind: BlockKind;
  score: number;
}

/**
 * Same fuzzy-match algorithm as `<CommandPalette>` and `<SettingsSearch>`
 * (Int-12). Inlined deliberately — keeping these baseline components free of
 * cross-component dependencies makes them swappable in isolation.
 */
function basicMatchScore(kind: BlockKind, q: string): number {
  if (q === '') return 1;
  const needle = q.toLowerCase();
  const label = kind.label.toLowerCase();
  if (label === needle) return 10;
  if (label.startsWith(needle)) return 6;
  if (label.includes(needle)) return 4;
  if (kind.description !== undefined && kind.description.toLowerCase().includes(needle)) {
    return 3;
  }
  if (kind.group !== undefined && kind.group.toLowerCase().includes(needle)) return 2;
  for (const kw of kind.keywords ?? []) {
    const k = kw.toLowerCase();
    if (k === needle) return 3;
    if (k.includes(needle)) return 2;
  }
  return 0;
}

function rankKinds(kinds: readonly BlockKind[], q: string): ScoredKind[] {
  const scored: ScoredKind[] = [];
  for (const kind of kinds) {
    const score = basicMatchScore(kind, q);
    if (score === 0) continue;
    scored.push({ kind, score });
  }
  // Empty query → preserve registration order (so author-supplied grouping
  // is honoured visually). Only sort when the user is filtering.
  if (q === '') return scored;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.kind.label.localeCompare(b.kind.label);
  });
  return scored;
}

interface Group {
  group: string;
  kinds: readonly BlockKind[];
}

function groupByGroup(kinds: readonly BlockKind[]): readonly Group[] {
  // Preserve first-seen group order, like a stable Map. Items with no group
  // collapse under the empty key '' which renders without a heading.
  const byKey = new Map<string, BlockKind[]>();
  for (const kind of kinds) {
    const key = kind.group ?? '';
    const list = byKey.get(key);
    if (list) list.push(kind);
    else byKey.set(key, [kind]);
  }
  const out: Group[] = [];
  for (const [group, list] of byKey) {
    out.push({ group, kinds: list });
  }
  return out;
}

/**
 * Tab-autocomplete: when `query` is a unique case-insensitive prefix of
 * exactly one `group` label across `kinds`, return that label. Otherwise
 * return `null` (Tab is a no-op).
 */
function uniqueGroupPrefix(kinds: readonly BlockKind[], query: string): string | null {
  if (query === '') return null;
  const needle = query.toLowerCase();
  const matched = new Set<string>();
  for (const kind of kinds) {
    if (kind.group === undefined) continue;
    const g = kind.group;
    if (g.toLowerCase().startsWith(needle) && g.toLowerCase() !== needle) {
      matched.add(g);
    }
  }
  if (matched.size !== 1) return null;
  return [...matched][0]!;
}

export function BlockMenu({
  registry,
  surface,
  onInsert,
  trigger = '/',
  anchorRect,
  position,
  open,
  onClose,
  placeholder = 'Filter blocks…',
  ariaLabel = 'Insert block',
  variant = 'default',
  className,
}: BlockMenuProps): ReactNode {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  // -- Subscribe to the registry --------------------------------------------
  // `useSyncExternalStore` re-renders whenever `add` / `remove` notifies.
  const kinds = useSyncExternalStore<readonly BlockKind[]>(
    useCallback((cb) => registry.subscribe(cb), [registry]),
    useCallback(() => registry.list(surface), [registry, surface]),
    () => EMPTY_KINDS,
  );

  // -- Filter + group --------------------------------------------------------
  const scored = useMemo(() => rankKinds(kinds, query), [kinds, query]);
  const filtered = useMemo(() => scored.map((s) => s.kind), [scored]);
  const groups = useMemo(() => groupByGroup(filtered), [filtered]);

  // Reset query + highlight whenever the menu re-opens, so a stale state
  // never lingers between independent open events.
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      // Hand focus to the (visually small) search input so the user can
      // keep typing the moment the menu opens. Hosts that already focus
      // their editor can rely on `'/'` reaching the editor first; we focus
      // the menu input on the next tick.
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return (): void => {
        window.clearTimeout(id);
      };
    }
    return undefined;
  }, [open]);

  // Clamp highlight when filtered shrinks (e.g. user types more characters).
  useEffect(() => {
    if (highlight >= filtered.length) {
      setHighlight(filtered.length === 0 ? 0 : filtered.length - 1);
    }
  }, [filtered.length, highlight]);

  // Reset highlight whenever the query changes — top hit is usually the
  // best target after filter narrows.
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // -- Outside-click closes --------------------------------------------------
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: PointerEvent): void => {
      const root = containerRef.current;
      if (!root) return;
      if (!(e.target instanceof Node)) return;
      if (!root.contains(e.target)) onClose();
    };
    // Use `pointerdown` (not `click`) so the close fires before the editor
    // re-takes focus — otherwise a click on the editor would race with us.
    document.addEventListener('pointerdown', onPointerDown);
    return (): void => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onClose]);

  const insertKind = useCallback(
    (kind: BlockKind): void => {
      const ctx: BlockInsertContext = { surface, position };
      try {
        const result = kind.insert(ctx);
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            console.warn(`[cir] BlockMenu: kind "${kind.id}" insert rejected`, err);
          });
        }
      } catch (err) {
        console.warn(`[cir] BlockMenu: kind "${kind.id}" insert threw`, err);
      }
      onInsert(kind, ctx);
      onClose();
    },
    [onInsert, onClose, surface, position],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (filtered.length === 0 ? 0 : (h + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) =>
        filtered.length === 0 ? 0 : (h - 1 + filtered.length) % filtered.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const kind = filtered[highlight];
      if (kind) insertKind(kind);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      const completion = uniqueGroupPrefix(kinds, query);
      if (completion) {
        e.preventDefault();
        setQuery(completion);
      }
    }
  };

  if (!open) return null;

  // Anchor positioning. When `anchorRect` is provided we render fixed-pos so
  // the menu floats next to the caret regardless of scroll. Otherwise we
  // render in the document flow, leaving placement to the caller.
  const anchorStyle: React.CSSProperties =
    anchorRect !== undefined
      ? { position: 'fixed', top: anchorRect.top, left: anchorRect.left }
      : {};

  // Walk the groups assigning the running flat index so highlight matches
  // up across group boundaries (mirrors SettingsSearch).
  let runningIndex = 0;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={ariaLabel}
      data-cir-component="BlockMenu"
      data-variant={variant}
      data-cir-surface={surface}
      data-cir-trigger={trigger}
      data-elevation="popover"
      style={anchorStyle}
      className={cn(blockMenuVariantClass[variant], elevationClass.popover, className)}
    >
      <div data-cir-part="block-menu-input">
        <label htmlFor={inputId} data-cir-part="block-menu-label">
          {ariaLabel}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          role="searchbox"
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
          }}
          onKeyDown={onKeyDown}
          data-cir-part="block-menu-field"
          autoFocus
        />
      </div>
      <ul role="listbox" data-cir-part="block-menu-list" aria-label={ariaLabel}>
        {filtered.length === 0 ? (
          <li data-cir-part="block-menu-empty" role="presentation">
            No matching blocks.
          </li>
        ) : (
          groups.map((group) => (
            <li
              key={group.group || '_default'}
              role="presentation"
              data-cir-part="block-menu-group"
              data-group={group.group}
            >
              {group.group !== '' ? (
                <div data-cir-part="block-menu-section">{group.group}</div>
              ) : null}
              <ul role="group" aria-label={group.group || undefined}>
                {group.kinds.map((kind) => {
                  const i = runningIndex++;
                  const highlighted = i === highlight;
                  const iconRef = kind.icon !== undefined ? normalizeIconRef(kind.icon) : null;
                  return (
                    <li
                      key={kind.id}
                      role="option"
                      aria-selected={highlighted}
                      data-cir-part="block-menu-item"
                      data-cir-kind={kind.id}
                      data-highlighted={highlighted ? 'true' : 'false'}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          insertKind(kind);
                        }}
                        onMouseEnter={() => {
                          setHighlight(i);
                        }}
                        style={{
                          display: 'flex',
                          width: '100%',
                          textAlign: 'left',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {iconRef !== null ? (
                          <span data-cir-part="block-menu-icon">
                            <Icon set={iconRef.set} name={iconRef.name} ariaLabel={kind.label} />
                          </span>
                        ) : null}
                        <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <span data-cir-part="block-menu-item-label">{kind.label}</span>
                          {kind.description !== undefined ? (
                            <span data-cir-part="block-menu-item-description">
                              {kind.description}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

BlockMenu.displayName = 'BlockMenu';

export function blockMenuTextRender(props: BlockMenuProps): string {
  const count = props.registry.list(props.surface).length;
  return `[BlockMenu: ${String(count)} kinds for ${props.surface}]`;
}

export const BlockMenuBinding: ComponentBinding = {
  id: 'BlockMenu',
  factory: BlockMenu,
};

// Re-export the registry surface from the component module so hosts that
// only import `<BlockMenu>` get a working reference to the data shape.
export { ALL_SURFACES, InMemoryBlockKindRegistry } from '../blocks/registry.js';
export type {
  BlockInsertContext,
  BlockKind,
  BlockKindRegistry,
  BlockKindRegistryListener,
} from '../blocks/registry.js';
