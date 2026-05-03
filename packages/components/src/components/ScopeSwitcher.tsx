// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * ScopeSwitcher — Wave 11 / Nav-5.
 *
 * Top-left chrome scope switcher. Vercel / Supabase / Linear all ship one:
 * a button that shows the active workspace / team / project, click opens a
 * popover with a fuzzy-search filter and grouped options, picking one
 * re-scopes the entire app. The persisted "which scope am I in?" signal
 * lives on `IntentProfile.scope_active`; the runtime threads it back as a
 * default for any component that opts in via its manifest contract.
 *
 * Mirrors the `<CommandPalette>` (Int-3) and `<SettingsSearch>` (Int-12)
 * patterns in spirit — fuzzy-match + keyboard nav + KeyboardRegistry
 * integration — but is meaningfully different from both:
 *
 *  - **Trigger button + popover**, not a dialog (CommandPalette) or an
 *    inline panel (SettingsSearch). The trigger shows the active scope's
 *    label + icon; clicking opens a popover anchored under it. Closing
 *    on outside-click / Escape mirrors the popover idiom Vercel ships.
 *  - **Active-scope state lives on the host.** The component is fully
 *    controlled — `value` is the active id, `onChange` is the host's
 *    setter (typically wired to write `IntentProfile.scope_active`).
 *  - **Grouped output.** Options render under the originating `group`
 *    label so a user typing nothing sees "Workspaces / Teams / Projects"
 *    (Vercel) or whatever the host configured.
 *  - **Self-registers `scope.switcher`** when a `<KeyboardProvider>` is in
 *    scope (Int-3) so the configured `hotkey` (default `'cmd+shift+o'`)
 *    opens the popover from anywhere — graceful fallback when no
 *    provider is wired.
 *
 * Fuzzy matching is the same case-insensitive substring score used by
 * `<CommandPalette>` and `<SettingsSearch>`: label hits beat description
 * hits beat group hits. Inline algorithm so this component has no
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
import { Icon } from './Icon.js';
import { normalizeIconRef, type IconRef } from '../icons/icon-ref.js';
import {
  cn,
  elevationClass,
  scopeSwitcherPopoverVariantClass,
  scopeSwitcherTriggerVariantClass,
  type ScopeSwitcherVariant,
} from './_variants.js';

export type { ScopeSwitcherVariant };

export interface ScopeOption {
  /**
   * Stable identifier. Convention: kebab-case scoped to the scope class
   * (`'workspace-acme'`, `'team-platform'`, `'project-aurora'`). Two
   * options sharing the same id collapse to the last one in `options`.
   */
  id: string;
  /** Human-readable label rendered in the trigger + the result list. */
  label: string;
  /** Optional sub-label / hint shown beneath the label in the popover. */
  description?: string;
  /**
   * Optional leading icon. Accepts either a bare string (`'archive'`)
   * resolved against the default lucide set, or `{ set, name }` for hosts
   * that wire a non-default pack.
   */
  icon?: IconRef;
  /**
   * Optional group label — `'Workspaces'`, `'Teams'`, `'Projects'`. Options
   * with the same `group` cluster under the same heading in the popover
   * (first-seen order preserved when the query is empty).
   */
  group?: string;
}

export interface ScopeSwitcherProps {
  /** The full universe of scopes the user can switch to. */
  options: readonly ScopeOption[];
  /** Active scope id. Must match one of `options[*].id` to drive the trigger label. */
  value: string;
  /** Called with the picked scope id when the user selects an option. */
  onChange: (id: string) => void;
  /** Placeholder for the popover's filter input. Defaults to `'Search scopes…'`. */
  placeholder?: string;
  /**
   * Hotkey that opens the popover via the `<KeyboardProvider>` registry
   * (Int-3). Defaults to `'cmd+shift+o'`. Pass `null` to skip registration
   * (hosts that wire their own opener).
   */
  hotkey?: string | null;
  /** Optional accessible label override for the trigger. Defaults to `'Switch scope'`. */
  ariaLabel?: string;
  variant?: ScopeSwitcherVariant;
  className?: string;
}

interface ScoredOption {
  option: ScopeOption;
  score: number;
}

function basicMatchScore(option: ScopeOption, q: string): number {
  if (q === '') return 1;
  const needle = q.toLowerCase();
  const label = option.label.toLowerCase();
  if (label === needle) return 10;
  if (label.startsWith(needle)) return 6;
  if (label.includes(needle)) return 4;
  if (option.description !== undefined && option.description.toLowerCase().includes(needle)) {
    return 3;
  }
  if (option.group !== undefined && option.group.toLowerCase().includes(needle)) return 2;
  return 0;
}

function rankOptions(options: readonly ScopeOption[], q: string): ScoredOption[] {
  const scored: ScoredOption[] = [];
  for (const option of options) {
    const score = basicMatchScore(option, q);
    if (score === 0) continue;
    scored.push({ option, score });
  }
  // Empty query → preserve author-supplied order so groups render top-to-
  // bottom in the host's intended sectioning. Only sort when filtering.
  if (q === '') return scored;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.option.label.localeCompare(b.option.label);
  });
  return scored;
}

interface Group {
  group: string;
  options: readonly ScopeOption[];
}

function groupByGroup(options: readonly ScopeOption[]): readonly Group[] {
  // Preserve first-seen group order, like a stable Map.
  const byKey = new Map<string, ScopeOption[]>();
  for (const option of options) {
    const key = option.group ?? '';
    const list = byKey.get(key);
    if (list) list.push(option);
    else byKey.set(key, [option]);
  }
  const out: Group[] = [];
  for (const [group, list] of byKey) {
    out.push({ group, options: list });
  }
  return out;
}

export function ScopeSwitcher({
  options,
  value,
  onChange,
  placeholder = 'Search scopes…',
  hotkey = 'cmd+shift+o',
  ariaLabel = 'Switch scope',
  variant = 'default',
  className,
}: ScopeSwitcherProps): ReactNode {
  const triggerId = useId();
  const popoverId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const services = useKeyboardServicesFromContext();

  const activeOption = useMemo(() => options.find((o) => o.id === value), [options, value]);

  // -- Filter + group ---------------------------------------------------------
  const scored = useMemo(() => rankOptions(options, query), [options, query]);
  const filtered = useMemo(() => scored.map((s) => s.option), [scored]);
  const groups = useMemo(() => groupByGroup(filtered), [filtered]);
  const flatItems = filtered;

  // Clamp highlight when filtered shrinks.
  useEffect(() => {
    if (highlight >= flatItems.length) {
      setHighlight(flatItems.length === 0 ? 0 : flatItems.length - 1);
    }
  }, [flatItems.length, highlight]);

  // Reset query + highlight when re-opening so a stale state never persists.
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      // Defer focus so the input is mounted before we focus it.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => {
        window.clearTimeout(id);
      };
    }
    return undefined;
  }, [open]);

  // -- Open / close handlers --------------------------------------------------
  const openPopover = useCallback((): void => {
    setOpen(true);
  }, []);
  const openPopoverRef = useRef(openPopover);
  openPopoverRef.current = openPopover;

  // Outside-click + Escape close. Mounted once when open.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: PointerEvent): void => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return (): void => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // -- Hotkey registration ----------------------------------------------------
  const shouldBindHotkey = hotkey !== null && services !== null;
  useEffect(() => {
    if (!shouldBindHotkey || !services || hotkey === null) return;
    const action: KeyboardAction = {
      id: 'scope.switcher',
      label: 'Switch scope',
      description: 'Open the workspace / team / project switcher',
      hotkey,
      scope: 'global',
      group: 'Navigation',
      icon: 'layers',
      invoke: () => {
        openPopoverRef.current();
      },
    };
    const unregister = services.registry.register(action);
    return () => {
      unregister();
    };
  }, [shouldBindHotkey, services, hotkey]);

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
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
      const option = flatItems[highlight];
      if (option) {
        onChange(option.id);
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    // Escape is handled by the document-level listener so the popover
    // can close from anywhere inside it (the input or the listbox).
  };

  // Walk the groups assigning the running flat index so highlight matches
  // up across group boundaries.
  let runningIndex = 0;

  return (
    <div
      ref={rootRef}
      data-cir-component="ScopeSwitcher"
      data-variant={variant}
      data-open={open ? 'true' : 'false'}
      data-active-scope={value}
      className={cn(className)}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={ariaLabel}
        data-cir-part="scope-trigger"
        className={scopeSwitcherTriggerVariantClass[variant]}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {activeOption?.icon !== undefined
          ? (() => {
              const ref = normalizeIconRef(activeOption.icon);
              return (
                <span data-cir-part="scope-trigger-icon" aria-hidden>
                  <Icon set={ref.set} name={ref.name} size={14} />
                </span>
              );
            })()
          : null}
        <span data-cir-part="scope-trigger-label">{activeOption?.label ?? value}</span>
        <span data-cir-part="scope-trigger-chevron" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label={ariaLabel}
          data-cir-part="scope-popover"
          data-elevation="popover"
          className={cn(scopeSwitcherPopoverVariantClass[variant], elevationClass.popover)}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            zIndex: 50,
          }}
        >
          <div data-cir-part="scope-search">
            <input
              ref={inputRef}
              type="search"
              role="searchbox"
              aria-label={ariaLabel}
              placeholder={placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.currentTarget.value);
              }}
              onKeyDown={onInputKeyDown}
              data-cir-part="scope-search-field"
            />
          </div>
          <ul role="listbox" aria-label={ariaLabel} data-cir-part="scope-list">
            {flatItems.length === 0 ? (
              <li data-cir-part="scope-empty" role="presentation">
                No matching scopes.
              </li>
            ) : (
              groups.map((group) => (
                <li
                  key={group.group || '_default'}
                  role="presentation"
                  data-cir-part="scope-group"
                  data-group={group.group}
                >
                  {group.group !== '' ? (
                    <div data-cir-part="scope-group-heading">{group.group}</div>
                  ) : null}
                  <ul role="group" aria-label={group.group || undefined}>
                    {group.options.map((option) => {
                      const i = runningIndex++;
                      const highlighted = i === highlight;
                      const selected = option.id === value;
                      return (
                        <li
                          key={option.id}
                          role="option"
                          aria-selected={highlighted}
                          data-cir-part="scope-option"
                          data-highlighted={highlighted ? 'true' : 'false'}
                          data-selected={selected ? 'true' : 'false'}
                          data-scope-id={option.id}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onChange(option.id);
                              setOpen(false);
                              triggerRef.current?.focus();
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
                            {option.icon !== undefined
                              ? (() => {
                                  const ref = normalizeIconRef(option.icon);
                                  return (
                                    <span data-cir-part="scope-option-icon" aria-hidden>
                                      <Icon set={ref.set} name={ref.name} size={14} />
                                    </span>
                                  );
                                })()
                              : null}
                            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                              <span data-cir-part="scope-option-label">{option.label}</span>
                              {option.description !== undefined ? (
                                <span data-cir-part="scope-option-description">
                                  {option.description}
                                </span>
                              ) : null}
                            </span>
                            {selected ? (
                              <span data-cir-part="scope-option-check" aria-hidden>
                                ✓
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
      ) : null}
    </div>
  );
}

ScopeSwitcher.displayName = 'ScopeSwitcher';

export function scopeSwitcherTextRender(props: ScopeSwitcherProps): string {
  const active = props.options.find((o) => o.id === props.value);
  const label = active?.label ?? props.value;
  const count = props.options.length;
  return `[ScopeSwitcher: ${label} (${String(count)} scopes)]`;
}

export const ScopeSwitcherBinding: ComponentBinding = {
  id: 'ScopeSwitcher',
  factory: ScopeSwitcher,
};
