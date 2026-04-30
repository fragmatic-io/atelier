// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * Sidebar — collapsible side navigation. Renders an `<aside
 * role="navigation">` with a toggle button and a list of items. Items may
 * carry one level of children — deeper nesting is intentionally rejected
 * here; routing trees that need it should compose `Tree` (Phase 5c batch
 * companion) inside a Stack instead.
 *
 * Wave 7b / track Nav-2 — collapsible behaviour upgrade. The component
 * still works without any of the new props (the legacy
 * `defaultCollapsed`-only call site renders identically), but opting in
 * to `collapsible` enables:
 *  - A keyboard shortcut (default `[`) that toggles collapse from
 *    anywhere on the page, suppressed inside form controls so typing
 *    `[` into a `<TextInput>` never flips the chrome.
 *  - Per-user persistence via `persistKey` — the collapse boolean is
 *    written to `localStorage` on every change and read back on mount,
 *    so a refresh restores the previous shape.
 *  - A controlled `collapsed` prop for hosts that own state elsewhere
 *    (router store, query param, app-level preferences). Controlled
 *    mode wins over storage so the prop is always authoritative.
 *  - A reduced-motion-aware width transition (~200ms; class is dropped
 *    when `prefers-reduced-motion: reduce` is set).
 *
 * `data-collapsed` continues to expose state for CSS (Phase 4c demo
 * Tailwind layer paints the slide-narrow), and the icon-only column
 * width (~48px collapsed / ~240px expanded) is set inline so consumers
 * without a stylesheet still see the right shape.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { readPersistedBool, writePersistedBool } from '../lib/persisted-state.js';
import { cn, navigationVariantClass, type NavigationVariant } from './_variants.js';

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
   * `localStorage` key used to persist the collapse boolean across
   * reloads. Ignored in controlled mode. Stored value is `'1'` / `'0'`
   * via `readPersistedBool` / `writePersistedBool`.
   */
  persistKey?: string;
  /**
   * Keyboard shortcut character that toggles collapse when
   * `collapsible` is true. Defaults to `'['`. Pass `false` to disable
   * the document-level listener entirely. Modifier keys (ctrl/meta/
   * alt/shift) and presses inside form controls / contenteditable are
   * ignored so the shortcut never steals legitimate input.
   */
  toggleShortcut?: string | false;
  side?: SidebarSide;
  className?: string;
  'aria-label'?: string;
  variant?: SidebarVariant;
}

/** Width (in pixels) of the icon-only collapsed column. */
export const SIDEBAR_COLLAPSED_WIDTH_PX = 48;
/** Width (in pixels) of the fully-expanded sidebar. */
export const SIDEBAR_EXPANDED_WIDTH_PX = 240;
/** Default keyboard shortcut character (Linear-style). */
export const SIDEBAR_DEFAULT_SHORTCUT = '[';

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

export function Sidebar({
  items,
  collapsible = false,
  collapsed: controlledCollapsed,
  defaultCollapsed = false,
  onCollapseChange,
  persistKey,
  toggleShortcut = SIDEBAR_DEFAULT_SHORTCUT,
  side = 'left',
  className,
  'aria-label': ariaLabelOverride,
  variant = 'default',
}: SidebarProps): ReactNode {
  const isControlled = controlledCollapsed !== undefined;

  // Initial uncontrolled state: persisted value (if any) wins over the
  // explicit `defaultCollapsed` so a returning user sees the shape they
  // last left behind. Done in lazy initialiser so the storage hit is
  // only paid once per mount.
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    if (collapsible && persistKey !== undefined) {
      return readPersistedBool(persistKey, defaultCollapsed);
    }
    return defaultCollapsed;
  });

  const effectiveCollapsed = isControlled ? controlledCollapsed : internalCollapsed;

  // Keep the latest onCollapseChange in a ref so the keyboard listener
  // closure does not need to be torn down on every render.
  const changeRef = useRef<((c: boolean) => void) | undefined>(onCollapseChange);
  useEffect(() => {
    changeRef.current = onCollapseChange;
  }, [onCollapseChange]);

  const setCollapsedAndPersist = useCallback(
    (next: boolean): void => {
      if (!isControlled) {
        setInternalCollapsed(next);
        if (collapsible && persistKey !== undefined) {
          writePersistedBool(persistKey, next);
        }
      }
      changeRef.current?.(next);
    },
    [isControlled, collapsible, persistKey],
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

  // Document-level keyboard shortcut. Bound only when both
  // `collapsible` is on AND `toggleShortcut` is a non-empty string.
  useEffect(() => {
    if (!collapsible) return;
    if (toggleShortcut === false) return;
    if (typeof toggleShortcut !== 'string' || toggleShortcut.length === 0) return;
    if (typeof document === 'undefined') return;
    const shortcut = toggleShortcut;
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
  }, [collapsible, toggleShortcut]);

  const reducedMotion = usePrefersReducedMotion();
  const ariaLabel = ariaLabelOverride ?? (collapsible ? 'Sidebar (collapsible)' : 'Sidebar');

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
        style={{ listStyle: 'none', margin: 0, padding: 0 }}
      >
        {items.map((it) => (
          <li
            key={it.id}
            data-cir-part="sidebar-item"
            data-active={it.activeId === true ? 'true' : 'false'}
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
              </a>
            ) : collapsible && effectiveCollapsed ? null : (
              <span data-cir-part="sidebar-label-static">{it.label}</span>
            )}
            {it.children !== undefined &&
            it.children.length > 0 &&
            !(collapsible && effectiveCollapsed) ? (
              <ul
                data-cir-part="sidebar-children"
                style={{ listStyle: 'none', margin: 0, padding: 0 }}
              >
                {it.children.map((c) => (
                  <li key={c.id} data-cir-part="sidebar-child">
                    <a href={c.href} data-cir-part="sidebar-child-link">
                      {c.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
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
