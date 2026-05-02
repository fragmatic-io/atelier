// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * TextInput — labelled text field. `label` is required so every input is
 * accessible by default; the label is associated to the input via a generated
 * id (consumers can override with `id`).
 *
 * Supports both controlled (`value` + `onChange`) and uncontrolled
 * (`defaultValue`) modes — same as the underlying `<input>`. `error` flips
 * `aria-invalid` and surfaces an inline error message wired with
 * `aria-describedby`.
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, inputVariantClass, type InputVariant } from './_variants.js';

export type TextInputVariant = InputVariant;

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  helperText?: string;
  error?: string;
  type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'search' | 'number';
  variant?: TextInputVariant;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    label,
    helperText,
    error,
    type = 'text',
    id,
    className,
    variant = 'default',
    ...rest
  }: TextInputProps,
  ref,
): ReactNode {
  const generatedId = useId();
  const inputId = id ?? `cir-input-${generatedId}`;
  const helperId = helperText !== undefined ? `${inputId}-helper` : undefined;
  const errorId = error !== undefined ? `${inputId}-error` : undefined;
  const describedBy = [helperId, errorId].filter((v): v is string => v !== undefined).join(' ');
  return (
    <div
      data-cir-component="TextInput"
      data-variant={variant}
      className={cn(inputVariantClass[variant], className)}
    >
      <label htmlFor={inputId} data-cir-part="input-label">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        type={type}
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

export function textInputTextRender(props: TextInputProps): string {
  return `[Input: ${props.label}]`;
}

export const TextInputBinding: ComponentBinding = {
  id: 'TextInput',
  factory: TextInput,
};
