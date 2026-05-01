// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * NavBar — semantic top-of-page navigation. Renders a `<nav role="navigation">`
 * with an optional `brand` slot on the left and an `<ul>` of `<a>` items on
 * the right. Accessibility is intentional: `aria-current="page"` flags the
 * active item so assistive tech announces it correctly.
 *
 * Stateless: the active flag is data driven, not internally tracked. A
 * router-aware variant that derives `active` from the current URL is a
 * Phase 4c concern — keeping this leaf agnostic of routing avoids leaking
 * Next.js / React Router into the baseline.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface NavItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface NavBarProps {
  items: readonly NavItem[];
  brand?: ReactNode;
  className?: string;
}

export function NavBar({ items = [], brand, className }: NavBarProps): ReactNode {
  return (
    <nav
      role="navigation"
      data-cir-component="NavBar"
      className={className}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
    >
      {brand !== undefined ? (
        <div data-cir-part="navbar-brand">{brand}</div>
      ) : (
        <div data-cir-part="navbar-brand" />
      )}
      <ul
        data-cir-part="navbar-items"
        style={{ display: 'flex', gap: '12px', listStyle: 'none', margin: 0, padding: 0 }}
      >
        {items.map((it) => (
          <li key={it.href} data-cir-part="navbar-item">
            <a
              href={it.href}
              aria-current={it.active === true ? 'page' : undefined}
              data-active={it.active === true ? 'true' : 'false'}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

NavBar.displayName = 'NavBar';

export function navBarTextRender(props: NavBarProps): string {
  return `[NavBar: ${String(props.items.length)} items]`;
}

export const NavBarBinding: ComponentBinding = {
  id: 'NavBar',
  factory: NavBar,
};
