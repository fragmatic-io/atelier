// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * SettingsSearch — Wave 11 / Int-12.
 *
 * A search box scoped to a settings surface. Stripe / Slack / Notion all ship
 * one at the top of `/settings`: type "billing" → jump to `/settings/billing`
 * even though that page is three nav levels deep. Powers the same ergonomics
 * for any host that mounts a `<SettingsSearch>` over a flat list of
 * `SettingsItem`s.
 *
 * Mirrors the `<CommandPalette>` (Int-3) pattern in spirit — fuzzy match +
 * keyboard nav + KeyboardRegistry integration — but is meaningfully different:
 *
 *  - **Inline, not modal.** Settings search is a panel that sits at the top
 *    of the settings page, not a `<dialog>`. The user lands on `/settings`,
 *    sees the box, types. No Cmd+K → modal hop. Stripe/Slack/Notion all
 *    render it inline; we mirror that.
 *  - **Items are routes**, not actions. Each `SettingsItem.href` is a page
 *    you navigate to. The host wires `onSelect` to its router; the component
 *    itself stays neutral on navigation.
 *  - **Grouped output.** Results render under the originating `section`
 *    label so a user typing "api" sees "Developers / API keys" rather than
 *    a flat list with no context.
 *  - **Self-registers a `settings.search` action** when a `<KeyboardProvider>`
 *    is in scope (Int-3) so the configured `hotkey` (default `'/'`) opens
 *    the search via Cmd+K too. The action's `invoke` focuses the input so
 *    the user can type immediately.
 *
 * Fuzzy matching is the same case-insensitive substring score used by
 * `<CommandPalette>`: label hits beat description hits beat keyword hits;
 * exact / prefix / substring stratify within each. We keep the algorithm
 * inline (rather than reaching into the palette) so this component has no
 * cross-component dependency at runtime.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import type { KeyboardAction } from '@atelier/keyboard';
import { useKeyboardServicesFromContext } from '../keyboard/context.js';
import {
  cn,
  elevationClass,
  settingsSearchVariantClass,
  type SettingsSearchVariant,
} from './_variants.js';

export interface SettingsItem {
  /**
   * Stable identifier. Convention: kebab-case (`'billing'`, `'api-keys'`).
   * Two items with the same id collapse to the last one in `items`.
   */
  id: string;
  /** Human-readable label rendered in the result list. */
  label: string;
  /** Optional sub-label / hint shown beneath the label. */
  description?: string;
  /**
   * Destination URL. The component does not navigate on its own — the host
   * wires `onSelect` to its router (Next.js, react-router, plain `location`).
   * `href` is surfaced via `data-cir-href` so audit tooling can verify the
   * advertised path.
   */
  href: string;
  /**
   * Optional group label — `'Developers'`, `'Workspace'`, `'Billing'`. Items
   * with the same `section` cluster under the same heading in the result list.
   */
  section?: string;
  /**
   * Free-form keywords that improve fuzzy matching (`['payment', 'invoice']`
   * for the Billing item). Case-insensitive.
   */
  keywords?: readonly string[];
}

export interface SettingsSearchProps {
  /** The full universe of searchable items. Order is preserved within groups. */
  items: readonly SettingsItem[];
  /** Called with the selected item — usually wired to the host router. */
  onSelect: (item: SettingsItem) => void;
  /** Placeholder for the input. Defaults to `'Search settings…'`. */
  placeholder?: string;
  /**
   * Hotkey that opens / focuses the search via the `<KeyboardProvider>`
   * registry (Int-3). Defaults to `'/'`. Pass `null` to skip registration.
   */
  hotkey?: string | null;
  /** Optional accessible label override. Defaults to `'Search settings'`. */
  ariaLabel?: string;
  variant?: SettingsSearchVariant;
  className?: string;
}

interface ScoredItem {
  item: SettingsItem;
  score: number;
}

function basicMatchScore(item: SettingsItem, q: string): number {
  if (q === '') return 1;
  const needle = q.toLowerCase();
  const label = item.label.toLowerCase();
  if (label === needle) return 10;
  if (label.startsWith(needle)) return 6;
  if (label.includes(needle)) return 4;
  if (item.description !== undefined && item.description.toLowerCase().includes(needle)) {
    return 3;
  }
  if (item.section !== undefined && item.section.toLowerCase().includes(needle)) return 2;
  for (const kw of item.keywords ?? []) {
    const k = kw.toLowerCase();
    if (k === needle) return 3;
    if (k.includes(needle)) return 2;
  }
  return 0;
}

function rankItems(items: readonly SettingsItem[], q: string): ScoredItem[] {
  const scored: ScoredItem[] = [];
  for (const item of items) {
    const score = basicMatchScore(item, q);
    if (score === 0) continue;
    scored.push({ item, score });
  }
  // Empty query → preserve author-supplied order so the rendered list mirrors
  // the host's intended sectioning. Only sort when the user is filtering.
  if (q === '') return scored;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.label.localeCompare(b.item.label);
  });
  return scored;
}

interface Group {
  section: string;
  items: readonly SettingsItem[];
}

function groupBySection(items: readonly SettingsItem[]): readonly Group[] {
  // Preserve first-seen section order, like a stable Map.
  const byKey = new Map<string, SettingsItem[]>();
  for (const item of items) {
    const key = item.section ?? '';
    const list = byKey.get(key);
    if (list) list.push(item);
    else byKey.set(key, [item]);
  }
  const out: Group[] = [];
  for (const [section, list] of byKey) {
    out.push({ section, items: list });
  }
  return out;
}

export function SettingsSearch({
  items,
  onSelect,
  placeholder = 'Search settings…',
  hotkey = '/',
  ariaLabel = 'Search settings',
  variant = 'default',
  className,
}: SettingsSearchProps): ReactNode {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const services = useKeyboardServicesFromContext();

  // -- Filter + group ---------------------------------------------------------
  const scored = useMemo(() => rankItems(items, query), [items, query]);
  const filtered = useMemo(() => scored.map((s) => s.item), [scored]);
  const groups = useMemo(() => groupBySection(filtered), [filtered]);

  // Map the [group, idx] coordinate back to a flat highlight index so
  // ArrowUp / ArrowDown traverse across groups as one list.
  const flatItems = filtered;

  // Clamp highlight when filtered shrinks.
  useEffect(() => {
    if (highlight >= flatItems.length) {
      setHighlight(flatItems.length === 0 ? 0 : flatItems.length - 1);
    }
  }, [flatItems.length, highlight]);

  // Reset highlight whenever the query changes — the top hit is usually the
  // best one to land on first.
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // -- Hotkey registration ----------------------------------------------------
  // Register a `settings.search` action when a provider is in scope. The
  // action focuses the input so the user can type immediately. Skipped when
  // `hotkey === null` (host wires its own opener) or when no provider is
  // present (graceful degradation, just like CommandPalette).
  const focusInput = useCallback((): void => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const focusInputRef = useRef(focusInput);
  focusInputRef.current = focusInput;

  const shouldBindHotkey = hotkey !== null && services !== null;
  useEffect(() => {
    if (!shouldBindHotkey || !services || hotkey === null) return;
    const action: KeyboardAction = {
      id: 'settings.search',
      label: 'Search settings',
      description: 'Focus the settings search box',
      hotkey,
      scope: 'route',
      group: 'Settings',
      icon: 'search',
      invoke: () => {
        focusInputRef.current();
      },
    };
    const unregister = services.registry.register(action);
    return () => {
      unregister();
    };
  }, [shouldBindHotkey, services, hotkey]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (flatItems.length === 0 ? 0 : (h + 1) % flatItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) =>
        flatItems.length === 0 ? 0 : (h - 1 + flatItems.length) % flatItems.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[highlight];
      if (item) onSelect(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Clear the query first; if already empty, blur so the user can keep
      // tabbing through the page.
      if (query !== '') {
        setQuery('');
      } else {
        inputRef.current?.blur();
      }
    }
  };

  // Walk the groups assigning the running flat index so highlight matches
  // up across section boundaries.
  let runningIndex = 0;

  return (
    <div
      data-cir-component="SettingsSearch"
      data-variant={variant}
      data-elevation="resting"
      className={cn(settingsSearchVariantClass[variant], elevationClass.resting, className)}
    >
      <div data-cir-part="settings-search-input">
        <label htmlFor={inputId} data-cir-part="settings-search-label">
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
          data-cir-part="settings-search-field"
        />
      </div>
      <ul role="listbox" data-cir-part="settings-search-list" aria-label={ariaLabel}>
        {flatItems.length === 0 ? (
          <li data-cir-part="settings-search-empty" role="presentation">
            No matching settings.
          </li>
        ) : (
          groups.map((group) => (
            <li
              key={group.section || '_default'}
              role="presentation"
              data-cir-part="settings-search-group"
              data-section={group.section}
            >
              {group.section !== '' ? (
                <div data-cir-part="settings-search-section">{group.section}</div>
              ) : null}
              <ul role="group" aria-label={group.section || undefined}>
                {group.items.map((item) => {
                  const i = runningIndex++;
                  const highlighted = i === highlight;
                  return (
                    <li
                      key={item.id}
                      role="option"
                      aria-selected={highlighted}
                      data-cir-part="settings-search-item"
                      data-highlighted={highlighted ? 'true' : 'false'}
                      data-cir-href={item.href}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(item);
                        }}
                        onMouseEnter={() => {
                          setHighlight(i);
                        }}
                        style={{
                          display: 'flex',
                          width: '100%',
                          textAlign: 'left',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                      >
                        <span data-cir-part="settings-search-item-label">{item.label}</span>
                        {item.description !== undefined ? (
                          <span data-cir-part="settings-search-item-description">
                            {item.description}
                          </span>
                        ) : null}
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

SettingsSearch.displayName = 'SettingsSearch';

export function settingsSearchTextRender(props: SettingsSearchProps): string {
  const count = props.items.length;
  return `[SettingsSearch: ${String(count)} items]`;
}

export const SettingsSearchBinding: ComponentBinding = {
  id: 'SettingsSearch',
  factory: SettingsSearch,
};
