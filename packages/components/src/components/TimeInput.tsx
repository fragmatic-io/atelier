// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * TimeInput — labelled `<input type="time">`. Value is `'HH:MM'` (24-hour)
 * or `''`. Same controlled/uncontrolled shape as DateInput; the same
 * accessibility guarantees apply (`aria-invalid` + `aria-describedby` for
 * error/helper text).
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, inputVariantClass, type InputVariant } from './_variants.js';

export type TimeInputVariant = InputVariant;

export interface TimeInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue'
> {
  label: string;
  helperText?: string;
  error?: string;
  value?: string;
  defaultValue?: string;
  variant?: TimeInputVariant;
}

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(function TimeInput(
  { label, helperText, error, id, className, variant = 'default', ...rest }: TimeInputProps,
  ref,
): ReactNode {
  const generatedId = useId();
  const inputId = id ?? `cir-time-${generatedId}`;
  const helperId = helperText !== undefined ? `${inputId}-helper` : undefined;
  const errorId = error !== undefined ? `${inputId}-error` : undefined;
  const describedBy = [helperId, errorId].filter((v): v is string => v !== undefined).join(' ');
  return (
    <div
      data-cir-component="TimeInput"
      data-variant={variant}
      className={cn(inputVariantClass[variant], className)}
    >
      <label htmlFor={inputId} data-cir-part="input-label">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        type="time"
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

export function timeInputTextRender(props: TimeInputProps): string {
  return `[TimeInput: ${props.label}]`;
}

export const TimeInputBinding: ComponentBinding = {
  id: 'TimeInput',
  factory: TimeInput,
};
