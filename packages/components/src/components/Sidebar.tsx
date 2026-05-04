// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Sidebar — collapsible side navigation. Renders an `<aside
 * role="navigation">` with a toggle button and a list of items. Items may
 * carry one level of children — deeper nesting is intentionally rejected
 * here; routing trees that need it should compose `Tree` (Phase 5c batch
 * companion) inside a Stack instead.
 *
 * Wave 7b / Nav-2 (collapse boolean) — `collapsible` opts the component
 * into a keyboard shortcut (default `[`), per-user `localStorage`
 * persistence via `persistKey`, a controlled `collapsed` prop, and a
 * reduced-motion-aware width transition.
 *
 * Wave 11 / Nav-2 (memory + keyboard registry integration) — extends the
 * collapse-boolean shape with:
 *  - `storageKey` — namespaced persistence key. Replaces `persistKey` at
 *    the call site (legacy prop kept). When set, the sidebar persists
 *    BOTH the collapse boolean (`${storageKey}.collapsed`) and the per-
 *    node expanded set (`${storageKey}.expanded`) to `localStorage`.
 *  - Per-tree expand/collapse memory. Each item carrying `children`
 *    renders a chevron toggle; the open/closed set survives reload.
 *  - `collapseHotkey` — alias for `toggleShortcut` in Wave-11 naming
 *    (mirrors Linear's `[`). Both props accept the same shape.
 *  - `<KeyboardProvider>` integration. When a provider is in scope, the
 *    sidebar registers a `sidebar.toggle` action so Cmd+K palettes can
 *    discover it. No-op when no provider is present.
 *
 * The richer host-facing persistence surface (`session`/`local`/`vault`
 * scopes, structured payloads, cross-tab sync) lives in
 * `@atelier/react`'s `usePersistedState`. The Sidebar uses the lighter
 * component-side helpers (`readPersistedJson` etc.) so `@atelier/components`
 * stays free of an `@atelier/react` runtime dep.
 *
 * `data-collapsed` continues to expose state for CSS (Phase 4c demo
 * Tailwind layer paints the slide-narrow), and the icon-only column
 * width (~48px collapsed / ~240px expanded) is set inline so consumers
 * without a stylesheet still see the right shape.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { useKeyboardAction } from '../keyboard/hooks.js';
import {
  readPersistedBool,
  readPersistedJson,
  writePersistedBool,
  writePersistedJson,
} from '../lib/persisted-state.js';
import type { NotificationAggregator } from '../notification/aggregator.js';
import { cn, navigationVariantClass, type NavigationVariant } from './_variants.js';
import { MetaBadge } from './MetaBadge.js';

export type SidebarSide = 'left' | 'right';
export type SidebarVariant = NavigationVariant;

export interface SidebarChildItem {
  id: string;
  label: string;
  href: string;
}

export interface SidebarItem {
  id: string;
  label: string;
  href?: string;
  icon?: ReactNode;
  /** When true, the item gets `aria-current="page"`. */
  activeId?: boolean;
  children?: readonly SidebarChildItem[];
  /**
   * Wave 11 / Vis-10 — when wired together with a `NotificationAggregator`
   * via the sidebar-level `aggregator` prop, this string is treated as a
   * rollup PREFIX (everything in the aggregator whose scope starts with
   * `badgeScope` rolls up). The aggregator's `rollup(badgeScope)` total
   * paints a `<MetaBadge>` next to the item's label; presence of any
   * mentions flips the badge to the `live` variant so the call-out reads
   * differently from a quiet unread bubble (Slack/Discord pattern).
   *
   * Hidden when the sidebar is collapsed to its mini-rail (no room for
   * the chip — the dot indicator is left as a follow-up).
   */
  badgeScope?: string;
}

export interface SidebarProps {
  items: readonly SidebarItem[];
  /**
   * Opt-in flag for Wave 7b collapsible behaviour. When `false` (the
   * default), the legacy uncontrolled toggle button is rendered exactly
   * as before; the keyboard shortcut and persistence machinery are
   * inert. Set to `true` to enable everything below.
   */
  collapsible?: boolean;
  /** Controlled collapse state. Wins over `persistKey` storage. */
  collapsed?: boolean;
  /** Initial collapse state for uncontrolled mode (and storage fallback). */
  defaultCollapsed?: boolean;
  /** Fires after every state change, controlled or otherwise. */
  onCollapseChange?: (collapsed: boolean) => void;
  /**
   * Wave 7b legacy prop. `localStorage` key used to persist the collapse
   * boolean across reloads. Ignored in controlled mode. Stored value is
   * `'1'` / `'0'` via `readPersistedBool` / `writePersistedBool`. New
   * call sites should prefer `storageKey` (Wave 11), which persists
   * BOTH the collapse boolean and the per-node expanded set under a
   * namespaced root.
   */
  persistKey?: string;
  /**
   * Wave 11 / Nav-2 — namespaced persistence root. When set (and the
   * sidebar is uncontrolled), the sidebar persists the collapse boolean
   * to `${storageKey}.collapsed` and the per-node expanded set to
   * `${storageKey}.expanded` in `localStorage`. The `expanded` payload
   * is a JSON-encoded `string[]` of item ids whose `children` are open.
   *
   * Coexistence: when both `persistKey` AND `storageKey` are set, the
   * Wave 11 `storageKey` wins; the legacy `persistKey` is ignored.
   */
  storageKey?: string;
  /**
   * Keyboard shortcut character that toggles collapse when
   * `collapsible` is true. Defaults to `'['`. Pass `false` to disable
   * the document-level listener entirely. Modifier keys (ctrl/meta/
   * alt/shift) and presses inside form controls / contenteditable are
   * ignored so the shortcut never steals legitimate input.
   */
  toggleShortcut?: string | false;
  /**
   * Wave 11 / Nav-2 alias for `toggleShortcut`. When both are passed,
   * `collapseHotkey` wins. Mirrors the Wave 11 prop-naming convention
   * across other primitives (`commandPaletteHotkey`, `quickSwitcherHotkey`).
   */
  collapseHotkey?: string | false;
  /**
   * Wave 11 / Nav-2 — controlled tree-node expanded set. Pass a
   * read-only array of item ids whose `children` should be rendered.
   * When provided, the sidebar treats this as the source of truth and
   * fires `onExpandedChange` on every toggle.
   *
   * Uncontrolled mode (default): the sidebar keeps the set in internal
   * state and (when `storageKey` is set) persists it to localStorage.
   */
  expanded?: readonly string[];
  /**
   * Initial expanded set for uncontrolled mode. Item ids whose
   * `children` are open on first render. Defaults to ALL ids that carry
   * children (matches Wave 7b's "always-open" behaviour for back-compat).
   */
  defaultExpanded?: readonly string[];
  /** Fires after every expanded-set change. */
  onExpandedChange?: (expanded: readonly string[]) => void;
  side?: SidebarSide;
  className?: string;
  'aria-label'?: string;
  variant?: SidebarVariant;
  /**
   * Wave 11 / Vis-10 — optional `NotificationAggregator` used to drive
   * grouped per-item unread badges. When provided, every item carrying
   * `badgeScope` shows a `<MetaBadge>` rendered from the aggregator's
   * `rollup(badgeScope)`. The sidebar `useSyncExternalStore`-subscribes
   * to the aggregator so wire updates re-render in place. Omit the prop
   * to opt out; per-item `badgeScope` without the aggregator is silently
   * ignored.
   */
  aggregator?: NotificationAggregator;
}

/** Width (in pixels) of the icon-only collapsed column. */
export const SIDEBAR_COLLAPSED_WIDTH_PX = 48;
/** Width (in pixels) of the fully-expanded sidebar. */
export const SIDEBAR_EXPANDED_WIDTH_PX = 240;
/** Default keyboard shortcut character (Linear-style). */
export const SIDEBAR_DEFAULT_SHORTCUT = '[';
/** Token-backed row gap shared by primary and secondary sidebar lists. */
export const SIDEBAR_ITEM_GAP = 'var(--atelier-space-xs, 4px)';

/**
 * Detect `prefers-reduced-motion: reduce`. Returns false during SSR and
 * on environments without `matchMedia`. Lives here (rather than the
 * shared lib) because the only other consumers
 * (`Tooltip`, `HoverCard`, `StatusBar`) each ship their own copy and a
 * cross-package extraction is out of scope for Nav-2.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent): void => {
      setReduced(e.matches);
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return (): void => {
        mq.removeEventListener('change', onChange);
      };
    }
    mq.addListener(onChange);
    return (): void => {
      mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

/**
 * Return true when the keyboard event originated from a form control
 * (input/textarea/select) or contenteditable region — those elements
 * own typing semantics and a global single-key shortcut must not steal
 * the press.
 */
function isFormControlTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return false;
}

/**
 * Compute the per-key storage paths used by Wave 11 / Nav-2 persistence.
 * Returns `null` when neither `storageKey` nor the legacy `persistKey`
 * implies persistence — keeps every callsite free of nested ternaries.
 */
function resolveStorageKeys(
  storageKey: string | undefined,
  persistKey: string | undefined,
): { collapsed: string; expanded: string | null } | null {
  if (storageKey !== undefined) {
    return { collapsed: `${storageKey}.collapsed`, expanded: `${storageKey}.expanded` };
  }
  if (persistKey !== undefined) {
    return { collapsed: persistKey, expanded: null };
  }
  return null;
}

/** Default expanded set: every item that has children. */
function allParentIds(items: readonly SidebarItem[]): readonly string[] {
  const out: string[] = [];
  for (const it of items) {
    if (it.children !== undefined && it.children.length > 0) out.push(it.id);
  }
  return out;
}

export function Sidebar({
  items,
  collapsible = false,
  collapsed: controlledCollapsed,
  defaultCollapsed = false,
  onCollapseChange,
  persistKey,
  storageKey,
  toggleShortcut = SIDEBAR_DEFAULT_SHORTCUT,
  collapseHotkey,
  expanded: controlledExpanded,
  defaultExpanded,
  onExpandedChange,
  side = 'left',
  className,
  'aria-label': ariaLabelOverride,
  variant = 'default',
  aggregator,
}: SidebarProps): ReactNode {
  const isControlled = controlledCollapsed !== undefined;
  const isExpandedControlled = controlledExpanded !== undefined;

  // Resolve the storage shape once per render. Wave 11 `storageKey`
  // wins over the legacy `persistKey` so a host that migrates can pass
  // both during the rollout without double-writing.
  const storage = resolveStorageKeys(storageKey, persistKey);

  // Initial uncontrolled state: persisted value (if any) wins over the
  // explicit `defaultCollapsed` so a returning user sees the shape they
  // last left behind. Done in lazy initialiser so the storage hit is
  // only paid once per mount.
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    if (collapsible && storage !== null) {
      return readPersistedBool(storage.collapsed, defaultCollapsed);
    }
    return defaultCollapsed;
  });

  const effectiveCollapsed = isControlled ? controlledCollapsed : internalCollapsed;

  // -- Wave 11 / Nav-2 — per-node expanded set ------------------------------
  // Default behaviour matches Wave 7b ("all children visible") so the
  // legacy uncontrolled call site renders identically. Persistence kicks
  // in only when `storageKey` is set (legacy `persistKey` does not opt
  // into the JSON-typed second key — it predates the shape).
  const [internalExpanded, setInternalExpanded] = useState<readonly string[]>(() => {
    if (storage !== null && storage.expanded !== null) {
      const fallback = defaultExpanded ?? allParentIds(items);
      return readPersistedJson<readonly string[]>(storage.expanded, fallback);
    }
    return defaultExpanded ?? allParentIds(items);
  });

  const effectiveExpanded = isExpandedControlled ? controlledExpanded : internalExpanded;
  const expandedSet = new Set(effectiveExpanded);

  // Keep the latest onCollapseChange in a ref so the keyboard listener
  // closure does not need to be torn down on every render.
  const changeRef = useRef<((c: boolean) => void) | undefined>(onCollapseChange);
  useEffect(() => {
    changeRef.current = onCollapseChange;
  }, [onCollapseChange]);
  const expandedChangeRef = useRef<((e: readonly string[]) => void) | undefined>(onExpandedChange);
  useEffect(() => {
    expandedChangeRef.current = onExpandedChange;
  }, [onExpandedChange]);

  const setCollapsedAndPersist = useCallback(
    (next: boolean): void => {
      if (!isControlled) {
        setInternalCollapsed(next);
        if (collapsible && storage !== null) {
          writePersistedBool(storage.collapsed, next);
        }
      }
      changeRef.current?.(next);
    },
    [isControlled, collapsible, storage?.collapsed],
  );

  const setExpandedAndPersist = useCallback(
    (nextOrUpdater: readonly string[] | ((prev: readonly string[]) => readonly string[])): void => {
      const resolveNext = (prev: readonly string[]): readonly string[] =>
        typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      if (!isExpandedControlled) {
        setInternalExpanded((prev) => {
          const next = resolveNext(prev);
          if (storage !== null && storage.expanded !== null) {
            writePersistedJson(storage.expanded, next);
          }
          expandedChangeRef.current?.(next);
          return next;
        });
        return;
      }
      const next = resolveNext(controlledExpanded ?? []);
      expandedChangeRef.current?.(next);
    },
    [isExpandedControlled, controlledExpanded, storage?.expanded],
  );

  const toggleNodeExpanded = useCallback(
    (id: string): void => {
      setExpandedAndPersist((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        return [...prev, id];
      });
    },
    [setExpandedAndPersist],
  );

  // Keep the latest "current collapse" + setter in refs so the document
  // keydown listener is mount-once and does not re-bind on every toggle.
  const collapsedRef = useRef(effectiveCollapsed);
  useEffect(() => {
    collapsedRef.current = effectiveCollapsed;
  }, [effectiveCollapsed]);
  const toggleRef = useRef(setCollapsedAndPersist);
  useEffect(() => {
    toggleRef.current = setCollapsedAndPersist;
  }, [setCollapsedAndPersist]);

  // Wave 11 alias — `collapseHotkey` wins over `toggleShortcut` when both
  // are passed. Falsy `false` disables the listener (legacy + new shape
  // share the same semantics).
  const effectiveHotkey: string | false =
    collapseHotkey !== undefined ? collapseHotkey : toggleShortcut;

  // Document-level keyboard shortcut. Bound only when both
  // `collapsible` is on AND the resolved hotkey is a non-empty string.
  useEffect(() => {
    if (!collapsible) return;
    if (effectiveHotkey === false) return;
    if (typeof effectiveHotkey !== 'string' || effectiveHotkey.length === 0) return;
    if (typeof document === 'undefined') return;
    const shortcut = effectiveHotkey;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== shortcut) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isFormControlTarget(e.target)) return;
      e.preventDefault();
      toggleRef.current(!collapsedRef.current);
    };
    document.addEventListener('keydown', onKeyDown);
    return (): void => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [collapsible, effectiveHotkey]);

  // Wave 11 / Nav-2 + Int-3 integration — when a `<KeyboardProvider>` is in
  // scope, register the toggle as a discoverable action so Cmd+K palettes
  // surface it ("Toggle sidebar — [") and chord/alias overrides (Int-7)
  // can rebind it without prop drilling. `useKeyboardAction` no-ops when
  // no provider is present.
  const keyboardHotkey =
    collapsible && typeof effectiveHotkey === 'string' && effectiveHotkey.length > 0
      ? effectiveHotkey
      : undefined;
  useKeyboardAction({
    id: 'sidebar.toggle',
    label: effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar',
    description: 'Toggle the sidebar between mini-rail and full-width',
    ...(keyboardHotkey !== undefined ? { hotkey: keyboardHotkey } : {}),
    scope: 'global',
    group: 'View',
    invoke: () => {
      if (!collapsible) return;
      toggleRef.current(!collapsedRef.current);
    },
  });

  const reducedMotion = usePrefersReducedMotion();
  const ariaLabel = ariaLabelOverride ?? (collapsible ? 'Sidebar (collapsible)' : 'Sidebar');

  // Wave 11 / Vis-10 — subscribe to the notification aggregator so wire
  // updates (websocket / push event / poll tick) flush a re-render. The
  // snapshot is the aggregator's monotonic `version()` counter — stable
  // between writes so `useSyncExternalStore`'s referential-equality check
  // does not trip the "snapshot result must be cached" loop. We re-read
  // each item's rollup below; the version number is purely the change
  // signal. When no aggregator is wired the hook short-circuits via the
  // no-op subscriber + constant snapshot.
  useSyncExternalStore(
    aggregator !== undefined
      ? (cb): (() => void) => aggregator.subscribe(cb)
      : (): (() => void) => (): void => {},
    () => (aggregator !== undefined ? aggregator.version() : 0),
    () => 0,
  );

  const widthPx = collapsible
    ? effectiveCollapsed
      ? SIDEBAR_COLLAPSED_WIDTH_PX
      : SIDEBAR_EXPANDED_WIDTH_PX
    : undefined;

  const transitionStyle: React.CSSProperties =
    collapsible && !reducedMotion ? { transition: 'width 200ms ease' } : {};

  const asideStyle: React.CSSProperties =
    widthPx !== undefined ? { width: `${String(widthPx)}px`, ...transitionStyle } : {};

  return (
    <aside
      role="navigation"
      aria-label={ariaLabel}
      data-cir-component="Sidebar"
      data-cir-side={side}
      data-collapsed={effectiveCollapsed ? 'true' : 'false'}
      data-cir-collapsible={collapsible ? 'true' : 'false'}
      data-cir-reduced-motion={collapsible && reducedMotion ? 'true' : undefined}
      data-variant={variant}
      className={cn(navigationVariantClass[variant], className)}
      style={asideStyle}
    >
      <button
        type="button"
        data-cir-part="sidebar-toggle"
        aria-expanded={!effectiveCollapsed}
        aria-controls="cir-sidebar-list"
        onClick={() => {
          setCollapsedAndPersist(!effectiveCollapsed);
        }}
      >
        {effectiveCollapsed ? 'Expand' : 'Collapse'}
      </button>
      <ul
        id="cir-sidebar-list"
        data-cir-part="sidebar-items"
        style={{
          display: 'grid',
          gap: SIDEBAR_ITEM_GAP,
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {items.map((it) => {
          const hasChildren = it.children !== undefined && it.children.length > 0;
          const isOpen = !hasChildren || expandedSet.has(it.id);
          // Tree-node expand/collapse is suppressed entirely when the
          // sidebar is collapsed to its mini-rail (Wave 7b) — there is no
          // room to render the child list. The persisted set still
          // survives the collapsed state, so re-expanding the rail
          // restores the user's previous shape.
          const showChildren = hasChildren && isOpen && !(collapsible && effectiveCollapsed);

          // Wave 11 / Vis-10 — per-item rolled-up notification badge.
          // We compute the rollup synchronously (the aggregator is a
          // plain in-memory store, so no async hop). When `total` is
          // zero the badge is suppressed entirely so the rail doesn't
          // carry empty pills next to every item. Mention-bearing
          // rollups flip to the `live` variant — Slack/Discord paint
          // mentions in red and unread-only in a quieter tone; we
          // express that distinction through the existing MetaBadge
          // variant table rather than introducing a new colour token.
          const badgeRollup =
            aggregator !== undefined && it.badgeScope !== undefined
              ? aggregator.rollup(it.badgeScope)
              : undefined;
          const showBadge =
            badgeRollup !== undefined &&
            badgeRollup.total > 0 &&
            !(collapsible && effectiveCollapsed);
          const badgeVariant =
            badgeRollup !== undefined && (badgeRollup.mentions ?? 0) > 0 ? 'live' : 'default';

          return (
            <li
              key={it.id}
              data-cir-part="sidebar-item"
              data-active={it.activeId === true ? 'true' : 'false'}
              data-expanded={hasChildren ? (isOpen ? 'true' : 'false') : undefined}
              data-cir-badge-scope={it.badgeScope ?? undefined}
              data-cir-badge-mentions={
                badgeRollup !== undefined && (badgeRollup.mentions ?? 0) > 0 ? 'true' : undefined
              }
            >
              {it.href !== undefined ? (
                <a
                  href={it.href}
                  aria-current={it.activeId === true ? 'page' : undefined}
                  data-cir-part="sidebar-link"
                >
                  {it.icon !== undefined ? (
                    <span data-cir-part="sidebar-icon" aria-hidden="true">
                      {it.icon}
                    </span>
                  ) : null}
                  {collapsible && effectiveCollapsed ? null : (
                    <span data-cir-part="sidebar-label">{it.label}</span>
                  )}
                  {showBadge && badgeRollup !== undefined ? (
                    <span data-cir-part="sidebar-badge">
                      <MetaBadge count={badgeRollup.total} variant={badgeVariant} />
                    </span>
                  ) : null}
                </a>
              ) : collapsible && effectiveCollapsed ? null : (
                <>
                  <span data-cir-part="sidebar-label-static">{it.label}</span>
                  {showBadge && badgeRollup !== undefined ? (
                    <span data-cir-part="sidebar-badge">
                      <MetaBadge count={badgeRollup.total} variant={badgeVariant} />
                    </span>
                  ) : null}
                </>
              )}
              {hasChildren && !(collapsible && effectiveCollapsed) ? (
                <button
                  type="button"
                  data-cir-part="sidebar-node-toggle"
                  data-node-id={it.id}
                  aria-expanded={isOpen}
                  aria-controls={`cir-sidebar-children-${it.id}`}
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${it.label}`}
                  onClick={() => {
                    toggleNodeExpanded(it.id);
                  }}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
              ) : null}
              {showChildren ? (
                <ul
                  id={`cir-sidebar-children-${it.id}`}
                  data-cir-part="sidebar-children"
                  style={{
                    display: 'grid',
                    gap: SIDEBAR_ITEM_GAP,
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                  }}
                >
                  {it.children?.map((c) => (
                    <li key={c.id} data-cir-part="sidebar-child">
                      <a href={c.href} data-cir-part="sidebar-child-link">
                        {c.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

Sidebar.displayName = 'Sidebar';

export function sidebarTextRender(props: SidebarProps): string {
  return `[Sidebar(${props.side ?? 'left'}): ${String(props.items.length)} items]`;
}

export const SidebarBinding: ComponentBinding = {
  id: 'Sidebar',
  factory: Sidebar,
};
