// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * Form — schema-driven form wrapper. Hosts arbitrary input children and
 * appends Submit + Cancel buttons automatically. The submit handler is
 * called with a `FormData` snapshot of the form (the platform builds it for
 * us), and it may return a Promise — while pending, both buttons are
 * disabled to prevent double-submission.
 *
 * The Cancel button is only rendered when an `onCancel` is provided; it
 * uses `type="button"` so it does not fire form submission.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { Button } from './Button.js';
import { cn, formVariantClass, type FormVariant } from './_variants.js';

export interface FormProps {
  onSubmit: (formData: FormData) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  className?: string;
  children?: ReactNode;
  variant?: FormVariant;
}

export function Form({
  onSubmit,
  onCancel,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  className,
  children,
  variant = 'default',
}: FormProps): ReactNode {
  const [busy, setBusy] = useState(false);
  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const result = onSubmit(data);
    if (result instanceof Promise) {
      setBusy(true);
      void result.finally(() => {
        setBusy(false);
      });
    }
  };
  return (
    <form
      data-cir-component="Form"
      data-variant={variant}
      className={cn(formVariantClass[variant], className)}
      onSubmit={handleSubmit}
    >
      {children}
      <div data-cir-part="form-actions">
        {onCancel !== undefined ? (
          <Button variant="ghost" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
        ) : null}
        <Button variant="primary" type="submit" disabled={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

Form.displayName = 'Form';

export function formTextRender(props: FormProps): string {
  return `[Form: ${props.submitLabel ?? 'Submit'}]`;
}

export const FormBinding: ComponentBinding = {
  id: 'Form',
  factory: Form,
};
