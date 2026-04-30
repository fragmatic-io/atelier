// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * MultiSelect — controlled native `<select multiple>`. We ship the platform
 * widget for the baseline: a custom combobox would need its own a11y
 * harness (focus traps, role="listbox", typeahead) which is well out of
 * scope for the baseline. A richer implementation can land in Phase 4c when
 * a manifest demands it.
 *
 * `values` is the source of truth. `onChange` receives the next array of
 * selected values whenever the user multi-selects via Cmd/Ctrl-click or
 * keyboard.
 */
import { useId, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, inputVariantClass, type InputVariant } from './_variants.js';

export type MultiSelectVariant = InputVariant;

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectProps {
  label: string;
  options: readonly MultiSelectOption[];
  values: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  variant?: MultiSelectVariant;
}

export function MultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder,
  id,
  name,
  disabled,
  className,
  variant = 'default',
}: MultiSelectProps): ReactNode {
  const generatedId = useId();
  const selectId = id ?? `cir-multiselect-${generatedId}`;
  return (
    <div
      data-cir-component="MultiSelect"
      data-variant={variant}
      className={cn(inputVariantClass[variant], className)}
    >
      <label htmlFor={selectId} data-cir-part="multiselect-label">
        {label}
      </label>
      <select
        id={selectId}
        name={name}
        multiple
        value={values}
        disabled={disabled}
        aria-label={placeholder}
        onChange={(e) => {
          const next = Array.from(e.currentTarget.selectedOptions, (o) => o.value);
          onChange(next);
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

MultiSelect.displayName = 'MultiSelect';

export function multiSelectTextRender(props: MultiSelectProps): string {
  const labels = props.options
    .filter((o) => props.values.includes(o.value))
    .map((o) => o.label)
    .join(', ');
  return `[MultiSelect: ${props.label} = ${labels !== '' ? labels : 'none'}]`;
}

export const MultiSelectBinding: ComponentBinding = {
  id: 'MultiSelect',
  factory: MultiSelect,
};
