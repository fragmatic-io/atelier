// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * DateInput — labelled `<input type="date">`. Value is the ISO-8601 calendar
 * date string `'YYYY-MM-DD'` or `''` for empty. We use the platform widget
 * intentionally: it ships keyboard navigation and a native picker on mobile
 * for free, which matters more for a baseline than custom styling.
 *
 * Controlled or uncontrolled, mirroring TextInput. `error` flips
 * `aria-invalid` and surfaces an inline error message via `aria-describedby`.
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface DateInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue'
> {
  label: string;
  helperText?: string;
  error?: string;
  value?: string;
  defaultValue?: string;
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { label, helperText, error, id, className, ...rest }: DateInputProps,
  ref,
): ReactNode {
  const generatedId = useId();
  const inputId = id ?? `cir-date-${generatedId}`;
  const helperId = helperText !== undefined ? `${inputId}-helper` : undefined;
  const errorId = error !== undefined ? `${inputId}-error` : undefined;
  const describedBy = [helperId, errorId].filter((v): v is string => v !== undefined).join(' ');
  return (
    <div data-cir-component="DateInput" className={className}>
      <label htmlFor={inputId} data-cir-part="input-label">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        type="date"
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={describedBy !== '' ? describedBy : undefined}
        {...rest}
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

export function dateInputTextRender(props: DateInputProps): string {
  return `[DateInput: ${props.label}]`;
}

export const DateInputBinding: ComponentBinding = {
  id: 'DateInput',
  factory: DateInput,
};
