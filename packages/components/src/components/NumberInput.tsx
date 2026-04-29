// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * NumberInput — labelled numeric field. Controlled-only (`value` + `onChange`)
 * by design: numeric inputs come with too many empty/invalid edge cases to
 * make a reliable uncontrolled fallback worth the surface area. `value` is
 * `number | ''` so the field can be cleared without forcing a `NaN` round-trip
 * through the parent.
 *
 * `inputMode="decimal"` triggers the right mobile keyboard. `min` / `max` /
 * `step` are forwarded to the underlying input so HTML constraint validation
 * still works; consumers should still validate at submission time because
 * users can paste anything.
 */
import { forwardRef, useId, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface NumberInputProps {
  label: string;
  value: number | '';
  onChange: (value: number | '') => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  helperText?: string;
  error?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  {
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    placeholder,
    helperText,
    error,
    id,
    name,
    disabled,
    className,
  }: NumberInputProps,
  ref,
): ReactNode {
  const generatedId = useId();
  const inputId = id ?? `cir-number-${generatedId}`;
  const helperId = helperText !== undefined ? `${inputId}-helper` : undefined;
  const errorId = error !== undefined ? `${inputId}-error` : undefined;
  const describedBy = [helperId, errorId].filter((v): v is string => v !== undefined).join(' ');
  return (
    <div data-cir-component="NumberInput" className={className}>
      <label htmlFor={inputId} data-cir-part="input-label">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        name={name}
        type="number"
        inputMode="decimal"
        value={value === '' ? '' : String(value)}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={describedBy !== '' ? describedBy : undefined}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          if (raw === '') {
            onChange('');
            return;
          }
          const parsed = Number(raw);
          onChange(Number.isNaN(parsed) ? '' : parsed);
        }}
      />
      {helperText !== undefined ? (
        <p id={helperId} data-cir-part="input-helper">
          {helperText}
        </p>
      ) : null}
      {error !== undefined ? (
        <p id={errorId} data-cir-part="input-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export function numberInputTextRender(props: NumberInputProps): string {
  return `[NumberInput: ${props.label}]`;
}

export const NumberInputBinding: ComponentBinding = {
  id: 'NumberInput',
  factory: NumberInput,
};
