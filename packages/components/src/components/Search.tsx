// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * Search — controlled search field rendered as `<form role="search">` with
 * a native `<input type="search">`. Submitting the form (Enter inside the
 * input) calls `onSubmit`. A clear button is rendered by default and resets
 * the value via `onChange('')`.
 *
 * The input is labelled by an associated `<label>` (visible) wired with a
 * stable `useId`. That keeps screen readers happy without forcing the host
 * to provide an id.
 */
import { useId, type FormEvent, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface SearchProps {
  value: string;
  onChange: (q: string) => void;
  onSubmit?: (q: string) => void;
  placeholder?: string;
  clearable?: boolean;
  label?: string;
  className?: string;
}

export function Search({
  value,
  onChange,
  onSubmit,
  placeholder,
  clearable = true,
  label = 'Search',
  className,
}: SearchProps): ReactNode {
  const generatedId = useId();
  const inputId = `cir-search-${generatedId}`;
  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    onSubmit?.(value);
  };
  return (
    <form role="search" data-cir-component="Search" className={className} onSubmit={handleSubmit}>
      <label htmlFor={inputId} data-cir-part="search-label">
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.currentTarget.value);
        }}
        data-cir-part="search-input"
      />
      {clearable && value !== '' ? (
        <button
          type="button"
          data-cir-part="search-clear"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
          }}
        >
          Clear
        </button>
      ) : null}
    </form>
  );
}

Search.displayName = 'Search';

export function searchTextRender(props: SearchProps): string {
  const v = props.value !== '' ? props.value : '(empty)';
  return `[Search: ${v}]`;
}

export const SearchBinding: ComponentBinding = {
  id: 'Search',
  factory: Search,
};
