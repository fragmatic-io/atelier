// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * FileUpload — labelled `<input type="file">` with a small chosen-file
 * summary. We keep the visual surface tiny (input + filename list); a
 * Phase 4c skin can hide the native input behind a button trigger and
 * style the dropzone, but the markup contract — a real `<input>` and a
 * sibling `<ul data-cir-part="file-list">` — does not change.
 *
 * Internal state holds the most-recent `File[]` solely to render the
 * filename list; `onFiles` is the source of truth for consumers.
 */
import { forwardRef, useId, useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, inputVariantClass, type InputVariant } from './_variants.js';

export type FileUploadVariant = InputVariant;

export interface FileUploadProps {
  label: string;
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  variant?: FileUploadVariant;
}

export const FileUpload = forwardRef<HTMLInputElement, FileUploadProps>(function FileUpload(
  {
    label,
    onFiles,
    accept,
    multiple,
    id,
    name,
    disabled,
    className,
    variant = 'default',
  }: FileUploadProps,
  ref,
): ReactNode {
  const generatedId = useId();
  const inputId = id ?? `cir-file-${generatedId}`;
  const [chosen, setChosen] = useState<readonly string[]>([]);
  return (
    <div
      data-cir-component="FileUpload"
      data-variant={variant}
      className={cn(inputVariantClass[variant], className)}
    >
      <label htmlFor={inputId} data-cir-part="file-label">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          const list = e.currentTarget.files;
          const files = list ? Array.from(list) : [];
          setChosen(files.map((f) => f.name));
          onFiles(files);
        }}
      />
      {chosen.length > 0 ? (
        <ul data-cir-part="file-list">
          {chosen.map((name, i) => (
            <li key={`${name}-${String(i)}`} data-cir-part="file-name">
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});

export function fileUploadTextRender(props: FileUploadProps): string {
  return `[FileUpload: ${props.label}]`;
}

export const FileUploadBinding: ComponentBinding = {
  id: 'FileUpload',
  factory: FileUpload,
};
