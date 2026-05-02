// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * CodeEditor — minimal monospaced code input. A `<textarea>` underneath, an
 * optional `<ol>` line-number gutter as a sibling. No syntax highlighting,
 * no auto-indent beyond the Tab key inserting two spaces. Phase 6 can swap
 * in Monaco or CodeMirror via the same prop surface (the binding id stays
 * stable so manifests don't move).
 *
 * `language` is forwarded as `data-language` so a Phase 4c CSS layer or a
 * future highlighter can pick it up. `readOnly` flows straight through to
 * the textarea. `showLineNumbers` derives the gutter from the current value
 * — we count `\n` characters so empty trailing lines still render.
 */
import { useId, useMemo, type KeyboardEvent, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, inputVariantClass, type InputVariant } from './_variants.js';

export type CodeEditorVariant = InputVariant;

export interface CodeEditorProps {
  value: string;
  onChange: (code: string) => void;
  language?: string;
  placeholder?: string;
  label: string;
  readOnly?: boolean;
  showLineNumbers?: boolean;
  className?: string;
  variant?: CodeEditorVariant;
}

const TAB = '  ';

export function CodeEditor({
  value,
  onChange,
  language,
  placeholder,
  label,
  readOnly = false,
  showLineNumbers = false,
  className,
  variant = 'default',
}: CodeEditorProps): ReactNode {
  const id = useId();
  const textareaId = `${id}-textarea`;
  const labelId = `${id}-label`;

  const lines = useMemo(() => {
    if (!showLineNumbers) return [];
    // Count newlines + 1; an empty value still yields one line.
    const n = value.length === 0 ? 1 : value.split('\n').length;
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [value, showLineNumbers]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== 'Tab' || readOnly) return;
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = `${value.slice(0, start)}${TAB}${value.slice(end)}`;
    onChange(next);
    // Restore caret AFTER React has re-rendered.
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + TAB.length;
    });
  };

  return (
    <div
      data-cir-component="CodeEditor"
      data-language={language ?? ''}
      data-line-numbers={showLineNumbers ? 'true' : 'false'}
      data-variant={variant}
      className={cn(inputVariantClass[variant], className)}
    >
      <label id={labelId} htmlFor={textareaId} data-cir-part="codeeditor-label">
        {label}
      </label>
      <div
        data-cir-part="codeeditor-row"
        style={{ display: 'flex', alignItems: 'stretch', fontFamily: 'monospace' }}
      >
        {showLineNumbers ? (
          <ol
            data-cir-part="codeeditor-gutter"
            aria-hidden="true"
            style={{
              listStyle: 'none',
              padding: '0 8px 0 0',
              margin: 0,
              textAlign: 'right',
              userSelect: 'none',
            }}
          >
            {lines.map((n) => (
              <li key={n} data-cir-part="codeeditor-line" style={{ lineHeight: '1.5' }}>
                {n}
              </li>
            ))}
          </ol>
        ) : null}
        <textarea
          id={textareaId}
          data-cir-part="codeeditor-textarea"
          value={value}
          onChange={(e) => {
            onChange(e.currentTarget.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          readOnly={readOnly}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          aria-labelledby={labelId}
          style={{
            flex: 1,
            fontFamily: 'monospace',
            lineHeight: '1.5',
            whiteSpace: 'pre',
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}

CodeEditor.displayName = 'CodeEditor';

export function codeEditorTextRender(props: CodeEditorProps): string {
  const lang = props.language !== undefined && props.language !== '' ? `(${props.language})` : '';
  return `[CodeEditor${lang}: ${props.label}]`;
}

export const CodeEditorBinding: ComponentBinding = {
  id: 'CodeEditor',
  factory: CodeEditor,
};
