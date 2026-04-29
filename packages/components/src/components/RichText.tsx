// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * RichText — minimal content-editable rich text editor (Phase 5c baseline).
 *
 * Implementation is intentionally tiny: a `contentEditable` div whose
 * formatting is driven by `document.execCommand`. `execCommand` is marked
 * deprecated in MDN/W3C, but every shipping browser still implements it and
 * it lets us deliver a working editor without a runtime dependency. Phase 6
 * will swap this binding for Lexical or TipTap (both ~50 KB minified) once
 * the editor surface stabilises and we want collaborative editing / proper
 * IME handling / undo grouping. Until then this is the agreed-upon
 * compromise: zero deps, semantic HTML, fits the "leaf" composition rule.
 *
 * Output sanitisation runs on every `input`. The allowlist below is a tiny
 * inline DOM walker (~25 LOC) — we deliberately avoid pulling in DOMPurify
 * to honour the zero-new-deps constraint for this batch. The allowlist is
 * conservative: only `b`, `strong`, `i`, `em`, `a` (with `href`), `ul`/`ol`/
 * `li`, `p`, `br`, and `div` are kept; everything else is unwrapped to its
 * text content. Phase 6 should revisit with a proper sanitiser once we
 * adopt one.
 *
 * The editor is uncontrolled in the React sense: setting `value` only seeds
 * the editor on first mount (and when the host explicitly re-mounts via
 * `key`). React DOES NOT diff `dangerouslySetInnerHTML` on every render —
 * doing so would clobber the caret on every keystroke. Hosts that need a
 * truly controlled editor should reach for the Phase 6 replacement.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export type RichTextToolbarItem = 'bold' | 'italic' | 'link' | 'bullet';

export interface RichTextProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  label: string;
  toolbar?: readonly RichTextToolbarItem[];
  ariaDescribedBy?: string;
  className?: string;
}

const DEFAULT_TOOLBAR: readonly RichTextToolbarItem[] = ['bold', 'italic', 'link', 'bullet'];

const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'A',
  'UL',
  'OL',
  'LI',
  'P',
  'BR',
  'DIV',
  'SPAN',
]);

/**
 * Tiny allowlist sanitiser. Walks the parsed HTML, drops disallowed tags
 * (preserving their text), strips disallowed attributes (only `href` on `a`
 * survives), and returns the cleaned `innerHTML`.
 */
export function sanitizeRichTextHtml(input: string): string {
  if (typeof document === 'undefined') return input;
  const tpl = document.createElement('template');
  tpl.innerHTML = input;
  const root = tpl.content;

  const walk = (node: Node): void => {
    // Snapshot children — we mutate during the walk.
    const kids = Array.from(node.childNodes);
    for (const child of kids) {
      if (child.nodeType === 1) {
        const el = child as HTMLElement;
        if (!ALLOWED_TAGS.has(el.tagName)) {
          // Unwrap: replace element with its text content.
          const text = document.createTextNode(el.textContent ?? '');
          el.replaceWith(text);
          continue;
        }
        // Strip every attribute except `href` on anchors.
        for (const attr of Array.from(el.attributes)) {
          const keep = el.tagName === 'A' && attr.name === 'href';
          if (!keep) el.removeAttribute(attr.name);
        }
        // Block javascript: URLs on the one allowed attribute.
        if (el.tagName === 'A') {
          const href = el.getAttribute('href') ?? '';
          if (/^\s*javascript:/i.test(href)) el.removeAttribute('href');
        }
        walk(el);
      } else if (child.nodeType !== 3 && child.nodeType !== 1) {
        // Drop comments, processing instructions, etc.
        child.parentNode?.removeChild(child);
      }
    }
  };
  walk(root);

  const wrap = document.createElement('div');
  wrap.appendChild(root);
  return wrap.innerHTML;
}

export function RichText({
  value,
  onChange,
  placeholder,
  label,
  toolbar = DEFAULT_TOOLBAR,
  ariaDescribedBy,
  className,
}: RichTextProps): ReactNode {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const labelId = useId();
  const editorId = `${labelId}-editor`;

  // Seed the editor on first mount.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
    // Intentionally only run on mount; see header comment for the
    // controlled-vs-uncontrolled rationale. `value` is omitted from the
    // dependency array because wiring it would clobber the caret on every
    // keystroke.
  }, []);

  const exec = (
    cmd: 'bold' | 'italic' | 'createLink' | 'insertUnorderedList',
    arg?: string,
  ): void => {
    if (typeof document === 'undefined') return;
    const el = editorRef.current;
    el?.focus();
    try {
      document.execCommand(cmd, false, arg);
    } catch {
      /* execCommand may throw in unusual envs; ignore. */
    }
    if (el) onChange(sanitizeRichTextHtml(el.innerHTML));
  };

  const onLink = (): void => {
    if (typeof window === 'undefined') return;
    const url = window.prompt('Enter URL') ?? '';
    if (url === '') return;
    exec('createLink', url);
  };

  return (
    <div data-cir-component="RichText" className={className}>
      <span id={labelId} data-cir-part="richtext-label">
        {label}
      </span>
      {toolbar.length > 0 ? (
        <div role="toolbar" aria-label={`${label} formatting`} data-cir-part="richtext-toolbar">
          {toolbar.includes('bold') ? (
            <button
              type="button"
              data-cir-part="richtext-bold"
              onClick={() => {
                exec('bold');
              }}
              aria-label="Bold"
            >
              B
            </button>
          ) : null}
          {toolbar.includes('italic') ? (
            <button
              type="button"
              data-cir-part="richtext-italic"
              onClick={() => {
                exec('italic');
              }}
              aria-label="Italic"
            >
              I
            </button>
          ) : null}
          {toolbar.includes('bullet') ? (
            <button
              type="button"
              data-cir-part="richtext-bullet"
              onClick={() => {
                exec('insertUnorderedList');
              }}
              aria-label="Bullet list"
            >
              • List
            </button>
          ) : null}
          {toolbar.includes('link') ? (
            <button
              type="button"
              data-cir-part="richtext-link"
              onClick={onLink}
              aria-label="Insert link"
            >
              Link
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        ref={editorRef}
        id={editorId}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelId}
        aria-describedby={ariaDescribedBy}
        contentEditable
        suppressContentEditableWarning
        data-cir-part="richtext-editor"
        data-placeholder={placeholder ?? ''}
        onInput={(e) => {
          onChange(sanitizeRichTextHtml(e.currentTarget.innerHTML));
        }}
      />
    </div>
  );
}

RichText.displayName = 'RichText';

export function richTextTextRender(props: RichTextProps): string {
  return `[RichText: ${props.label}]`;
}

export const RichTextBinding: ComponentBinding = {
  id: 'RichText',
  factory: RichText,
};
