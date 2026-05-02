// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Breadcrumb — `<nav aria-label="Breadcrumb">` wrapping an `<ol>` of items.
 * The last item is treated as the current page: it is rendered as plain
 * text with `aria-current="page"` (per WAI-ARIA breadcrumb pattern), even
 * if a consumer accidentally passes an `href`. Items are separated by a
 * visual `▸` glyph that is hidden from assistive tech (`aria-hidden`).
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, navigationVariantClass, type NavigationVariant } from './_variants.js';

export type BreadcrumbVariant = NavigationVariant;

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: readonly BreadcrumbItem[];
  className?: string;
  variant?: BreadcrumbVariant;
}

export function Breadcrumb({ items, className, variant = 'default' }: BreadcrumbProps): ReactNode {
  return (
    <nav
      aria-label="Breadcrumb"
      data-cir-component="Breadcrumb"
      data-variant={variant}
      className={cn(navigationVariantClass[variant], className)}
    >
      <ol
        data-cir-part="breadcrumb-list"
        style={{ display: 'flex', gap: '6px', listStyle: 'none', margin: 0, padding: 0 }}
      >
        {items.map((it, i) => {
          const isLast = i === items.length - 1;
          return (
            <li
              key={`${it.label}-${String(i)}`}
              data-cir-part="breadcrumb-item"
              data-current={isLast ? 'true' : 'false'}
            >
              {isLast || it.href === undefined ? (
                <span aria-current={isLast ? 'page' : undefined}>{it.label}</span>
              ) : (
                <a href={it.href}>{it.label}</a>
              )}
              {!isLast ? (
                <span aria-hidden="true" data-cir-part="breadcrumb-separator">
                  {' ▸ '}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

Breadcrumb.displayName = 'Breadcrumb';

export function breadcrumbTextRender(props: BreadcrumbProps): string {
  return `[Breadcrumb: ${props.items.map((i) => i.label).join(' > ')}]`;
}

export const BreadcrumbBinding: ComponentBinding = {
  id: 'Breadcrumb',
  factory: Breadcrumb,
};
