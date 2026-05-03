// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

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
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, inputVariantClass, type InputVariant } from './_variants.js';
import type { EmbedRegistry } from '../embeds/registry.js';
import type { EmbedDisplay } from '../embeds/resolver.js';

export type RichTextToolbarItem = 'bold' | 'italic' | 'link' | 'bullet';
export type RichTextVariant = InputVariant;

/**
 * Wave 11 / Int-15 — smart paste opt-in. When supplied, the editor's
 * paste handler routes through the `EmbedRegistry` (Cnt-4): if the
 * pasted text contains a URL the registry can resolve within
 * `unfurlTimeoutMs` (default 1500 ms), the host's `onUnfurl` callback
 * fires with the original URL + the resolved display payload — the
 * host decides whether to splice an embed card into the document, drop
 * a link card alongside the inserted text, or do nothing. The default
 * paste behaviour is NEVER cancelled here (the editor still inserts
 * the raw text); the unfurl callback runs alongside so the host can
 * compose its own UI on top.
 *
 * Mirrors the `useSmartPaste` hook in `@atelier/react` shape-for-shape.
 * RichText talks to the registry directly (rather than importing the
 * hook) to avoid the components → react dep cycle.
 */
export interface RichTextSmartPaste {
  embedRegistry: EmbedRegistry;
  /**
   * Fires when a pasted URL resolved through the registry within the
   * timeout. The handler is responsible for whatever UI should follow
   * (insert an embed card, render a side-panel preview, etc.). Errors
   * thrown here are swallowed so a faulty handler can't tear down the
   * editor on paste.
   */
  onUnfurl: (event: { url: string; display: EmbedDisplay }) => void;
  /**
   * Bound on the registry race. Default 1500 ms — generous enough for
   * the oEmbed fallback over a fast-ish network, tight enough that the
   * user doesn't perceive lag. `<= 0` disables unfurl.
   */
  unfurlTimeoutMs?: number;
}

export interface RichTextProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  label: string;
  toolbar?: readonly RichTextToolbarItem[];
  ariaDescribedBy?: string;
  className?: string;
  variant?: RichTextVariant;
  /**
   * Wave 11 / Int-15 opt-in. When supplied, paste events scan the
   * clipboard text for a URL and dispatch to the registry; on resolve,
   * `onUnfurl` fires. See `RichTextSmartPaste` for the contract.
   */
  pasteSmart?: RichTextSmartPaste;
}

const DEFAULT_TOOLBAR: readonly RichTextToolbarItem[] = ['bold', 'italic', 'link', 'bullet'];

const SMART_PASTE_DEFAULT_TIMEOUT_MS = 1500;

/**
 * Detect the first URL in a string — `http://` / `https://` schemes only
 * (the only schemes the embed resolvers handle). Trailing prose
 * punctuation is trimmed so "see https://example.com." doesn't include
 * the period. Mirrors the helper of the same name in
 * `@atelier/react/hooks/use-smart-paste`.
 */
export function detectFirstUrlForPaste(text: string): string | null {
  const match = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (match === null) return null;
  let url = match[0];
  url = url.replace(/[.,;:!?\]}]+$/u, '');
  while (url.endsWith(')') && !url.slice(0, -1).includes('(')) {
    url = url.slice(0, -1);
    url = url.replace(/[.,;:!?\]}]+$/u, '');
  }
  return url.length > 0 ? url : null;
}

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
  variant = 'default',
  pasteSmart,
}: RichTextProps): ReactNode {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const labelId = useId();
  const editorId = `${labelId}-editor`;

  // Capture the latest pasteSmart options in a ref so the paste handler
  // identity stays stable across renders even when callers pass a fresh
  // `onUnfurl` each time.
  const pasteSmartRef = useRef<RichTextSmartPaste | undefined>(pasteSmart);
  pasteSmartRef.current = pasteSmart;

  const onPaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>): void => {
    const opts = pasteSmartRef.current;
    if (opts === undefined) return;
    const data = e.clipboardData;
    if (data === null || data === undefined) return;
    let text: string;
    try {
      text = data.getData('text/plain') ?? '';
    } catch {
      return;
    }
    if (text.length === 0) return;
    const url = detectFirstUrlForPaste(text);
    if (url === null) return;
    const timeoutMs = opts.unfurlTimeoutMs ?? SMART_PASTE_DEFAULT_TIMEOUT_MS;
    if (timeoutMs <= 0) return;
    // We deliberately do NOT preventDefault — the editor still inserts
    // the raw text. The unfurl callback runs alongside so the host can
    // compose its own UI on top (insert embed card below, render a
    // side panel, etc.).
    let settled = false;
    const finish = (resolved: { provider: string; display: EmbedDisplay } | null): void => {
      if (settled) return;
      settled = true;
      if (resolved === null) return;
      try {
        opts.onUnfurl({ url, display: resolved.display });
      } catch {
        /* host handler errors must not tear down the editor on paste */
      }
    };
    const timer =
      typeof window !== 'undefined' && typeof window.setTimeout === 'function'
        ? window.setTimeout(() => finish(null), timeoutMs)
        : setTimeout(() => finish(null), timeoutMs);
    const clear = (): void => {
      if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
        window.clearTimeout(timer as number);
      } else {
        clearTimeout(timer as ReturnType<typeof setTimeout>);
      }
    };
    void opts.embedRegistry.resolve(url).then(
      (resolved) => {
        clear();
        finish(resolved);
      },
      () => {
        clear();
        finish(null);
      },
    );
  }, []);

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
    <div
      data-cir-component="RichText"
      data-variant={variant}
      className={cn(inputVariantClass[variant], className)}
    >
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
        onPaste={onPaste}
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
