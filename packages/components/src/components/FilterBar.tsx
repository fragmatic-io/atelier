// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * FilterBar — composable filter strip. Each filter declares an `id`, a
 * `label`, a `type` (`select` | `toggle` | `search`), an optional `options`
 * list (for selects), and a current `value`. The bar renders one control
 * per filter and emits `onChange(id, value)` on every interaction.
 *
 * The component is stateless from its own perspective: the host owns the
 * filter values. We render a `<form role="search">` so the bar is announced
 * as a search/filter region by assistive tech, but we suppress submission
 * (`onSubmit={preventDefault}`); changes are emitted live via `onChange`.
 */
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, filterBarVariantClass, type FilterBarVariant } from './_variants.js';

export type FilterType = 'select' | 'toggle' | 'search';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  id: string;
  label: string;
  type: FilterType;
  options?: readonly FilterOption[];
  value?: unknown;
}

export interface FilterBarProps {
  filters: readonly FilterDefinition[];
  onChange: (id: string, value: unknown) => void;
  className?: string;
  variant?: FilterBarVariant;
}

export function FilterBar({
  filters,
  onChange,
  className,
  variant = 'inline',
}: FilterBarProps): ReactNode {
  const stop = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
  };
  return (
    <form
      role="search"
      data-cir-component="FilterBar"
      data-variant={variant}
      className={cn(filterBarVariantClass[variant], className)}
      onSubmit={stop}
    >
      {filters.map((f) => {
        const inputId = `cir-filter-${f.id}`;
        if (f.type === 'select') {
          return (
            <div key={f.id} data-cir-part="filter-item" data-filter-type="select">
              <label htmlFor={inputId}>{f.label}</label>
              <select
                id={inputId}
                value={typeof f.value === 'string' ? f.value : ''}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  onChange(f.id, e.currentTarget.value);
                }}
              >
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        if (f.type === 'toggle') {
          return (
            <div key={f.id} data-cir-part="filter-item" data-filter-type="toggle">
              <label htmlFor={inputId}>{f.label}</label>
              <input
                id={inputId}
                type="checkbox"
                checked={f.value === true}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  onChange(f.id, e.currentTarget.checked);
                }}
              />
            </div>
          );
        }
        // 'search'
        return (
          <div key={f.id} data-cir-part="filter-item" data-filter-type="search">
            <label htmlFor={inputId}>{f.label}</label>
            <input
              id={inputId}
              type="search"
              value={typeof f.value === 'string' ? f.value : ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                onChange(f.id, e.currentTarget.value);
              }}
            />
          </div>
        );
      })}
    </form>
  );
}

FilterBar.displayName = 'FilterBar';

export function filterBarTextRender(props: FilterBarProps): string {
  return `[FilterBar: ${String(props.filters.length)} filters]`;
}

export const FilterBarBinding: ComponentBinding = {
  id: 'FilterBar',
  factory: FilterBar,
};
