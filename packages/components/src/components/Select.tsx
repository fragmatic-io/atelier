// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Select — controlled native `<select>`. We use the platform widget on
 * purpose: it ships keyboard navigation, screen-reader support, and mobile
 * native pickers for free. A custom listbox can replace this in Phase 4c
 * if richer styling demands it; for the baseline we don't pay the
 * accessibility cost.
 */
import { useId, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({
  label,
  options,
  value,
  onChange,
  id,
  name,
  disabled,
  className,
}: SelectProps): ReactNode {
  const generatedId = useId();
  const selectId = id ?? `cir-select-${generatedId}`;
  return (
    <div data-cir-component="Select" className={className}>
      <label htmlFor={selectId} data-cir-part="select-label">
        {label}
      </label>
      <select
        id={selectId}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.currentTarget.value);
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

Select.displayName = 'Select';

export function selectTextRender(props: SelectProps): string {
  const current = props.options.find((o) => o.value === props.value);
  return `[Select: ${props.label} = ${current?.label ?? props.value}]`;
}

export const SelectBinding: ComponentBinding = {
  id: 'Select',
  factory: Select,
};
