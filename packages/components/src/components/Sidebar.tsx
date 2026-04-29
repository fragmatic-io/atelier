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
 * The collapsed flag is owned internally (toggled by the button); a Phase
 * 6 controlled variant can layer `collapsed` + `onCollapsedChange` on top
 * without breaking the manifest contract. `data-collapsed` exposes the
 * state so a Phase 4c CSS layer can paint the slide-narrow transition.
 */
import { useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export type SidebarSide = 'left' | 'right';

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
  defaultCollapsed?: boolean;
  side?: SidebarSide;
  className?: string;
  'aria-label'?: string;
}

export function Sidebar({
  items,
  defaultCollapsed = false,
  side = 'left',
  className,
  'aria-label': ariaLabel = 'Sidebar',
}: SidebarProps): ReactNode {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <aside
      role="navigation"
      aria-label={ariaLabel}
      data-cir-component="Sidebar"
      data-cir-side={side}
      data-collapsed={collapsed ? 'true' : 'false'}
      className={className}
    >
      <button
        type="button"
        data-cir-part="sidebar-toggle"
        aria-expanded={!collapsed}
        aria-controls="cir-sidebar-list"
        onClick={() => {
          setCollapsed((c) => !c);
        }}
      >
        {collapsed ? 'Expand' : 'Collapse'}
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
                <span data-cir-part="sidebar-label">{it.label}</span>
              </a>
            ) : (
              <span data-cir-part="sidebar-label-static">{it.label}</span>
            )}
            {it.children !== undefined && it.children.length > 0 ? (
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
