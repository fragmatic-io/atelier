// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * CodeBlock — lightweight monospace code surface with auto-detected language
 * label, copy-to-clipboard button, and optional gutter line numbers.
 *
 * This is the "fast path" code component: zero-dep heuristic detection via
 * `detectLanguage`, no syntax-highlight tokeniser, ~3kb of component code.
 * Phase Cnt-1 will introduce a Shiki/Prism-grade highlighter behind a
 * feature flag — when it lands, `<Markdown>` will switch its triple-backtick
 * fence renderer over (currently `<CodeBlock>` is the default), and this
 * component continues to ship as the lightweight fallback.
 *
 * Design notes:
 *  - `<pre><code>` is the structural root; we set `whiteSpace: 'pre'` and
 *    `overflow-x-auto` so long lines scroll horizontally rather than reflow.
 *  - Copy button uses `navigator.clipboard.writeText` and falls back to a
 *    hidden `<textarea>` + `document.execCommand('copy')` for older browsers
 *    and HTTP-only contexts where the async clipboard API is unavailable.
 *  - The "copied" affordance is a checkmark that auto-reverts after 1500ms;
 *    the timer is cleared on unmount so a tear-down mid-flight does not
 *    set state on a dead component.
 *  - `data-color-mode="dark"` on any ancestor flips the surface tokens to
 *    light-on-dark via the variant table (Tailwind hosts pick this up; non-
 *    Tailwind hosts can target `[data-cir-component="CodeBlock"]` directly).
 *  - Line numbers, when shown, ride a separate non-selectable gutter so a
 *    select-all-then-copy of the visible block does NOT include the digits.
 *
 * Markdown integration site: a future `<Markdown>` triple-backtick fence
 * renderer should call into `<CodeBlock>` directly — pass the fence body as
 * `code` and the fence info-string as `language` (or omit to let detection
 * run). We deliberately do not modify `<Markdown>` here; that's tracked
 * separately as track Cnt-5.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { detectLanguage, type DetectedLanguage } from '../lib/detect-language.js';
import { cn, codeBlockVariantClass, type CodeBlockVariant } from './_variants.js';

export type { CodeBlockVariant } from './_variants.js';

export interface CodeBlockProps {
  /** Raw source code. Multi-line strings are split on `\n` for line numbers. */
  code: string;
  /** Explicit language id; when omitted, `detectLanguage` runs on the source. */
  language?: DetectedLanguage;
  /** Show the small uppercase language pill in the top-right. Default `true`. */
  showLanguageLabel?: boolean;
  /** Show a non-selectable gutter with 1-indexed line numbers. Default `false`. */
  showLineNumbers?: boolean;
  /** Show the icon-only copy button overlapping the language label. Default `true`. */
  showCopyButton?: boolean;
  /** Visual variant — see `_variants.ts` for the class table. Default `'default'`. */
  variant?: CodeBlockVariant;
  /** Class string forwarded to the outermost wrapper. */
  className?: string;
}

/** Time the checkmark stays visible after a successful copy. */
const COPY_CONFIRM_MS = 1500;

/**
 * Best-effort clipboard write. Returns `true` if the copy succeeded via
 * either the async clipboard API or the legacy `execCommand` fallback.
 *
 * The fallback path is required because:
 *  - `navigator.clipboard` is undefined in older browsers and on insecure
 *    origins (HTTP, file://). Some embedded webviews also block it.
 *  - `execCommand('copy')` is deprecated but still works as a last resort
 *    when the document is focused and a selection range exists.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy path.
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Off-screen so it never paints — but stays in the DOM long enough for
    // `select()` + `execCommand('copy')` to read its value.
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CodeBlock({
  code,
  language,
  showLanguageLabel = true,
  showLineNumbers = false,
  showCopyButton = true,
  variant = 'default',
  className,
}: CodeBlockProps): ReactNode {
  const resolved: DetectedLanguage = language ?? detectLanguage(code);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCopy = useCallback((): void => {
    void copyToClipboard(code).then((ok) => {
      if (!ok) return;
      setCopied(true);
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => {
        setCopied(false);
        copyTimer.current = null;
      }, COPY_CONFIRM_MS);
    });
  }, [code]);

  // Clear pending timer on unmount so we never set state on a dead component.
  useEffect(() => {
    return (): void => {
      if (copyTimer.current !== null) {
        clearTimeout(copyTimer.current);
        copyTimer.current = null;
      }
    };
  }, []);

  const lines = code.split('\n');
  const labelVisible = showLanguageLabel && resolved !== 'plaintext';

  return (
    <div
      data-cir-component="CodeBlock"
      data-language={resolved}
      data-variant={variant}
      className={cn(codeBlockVariantClass[variant], className)}
      style={{ position: 'relative' }}
    >
      {labelVisible || showCopyButton ? (
        <div
          data-cir-part="codeblock-toolbar"
          aria-hidden={!showCopyButton}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            zIndex: 1,
          }}
        >
          {labelVisible ? (
            <span
              data-cir-part="codeblock-language"
              style={{
                fontSize: '10px',
                lineHeight: '1',
                padding: '2px 6px',
                borderRadius: '999px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontFamily: 'ui-monospace, monospace',
                opacity: 0.7,
                userSelect: 'none',
              }}
            >
              {resolved}
            </span>
          ) : null}
          {showCopyButton ? (
            <button
              type="button"
              data-cir-part="codeblock-copy"
              data-copied={copied ? 'true' : undefined}
              aria-label="Copy code"
              onClick={onCopy}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '2px 6px',
                cursor: 'pointer',
                fontSize: '12px',
                lineHeight: '1',
                fontFamily: 'ui-monospace, monospace',
                opacity: 0.7,
              }}
            >
              {copied ? '✓' : '⧉'}
            </button>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {showLineNumbers ? (
          <ol
            data-cir-part="codeblock-line-numbers"
            aria-hidden="true"
            style={{
              margin: 0,
              padding: '0 8px 0 0',
              listStyle: 'none',
              textAlign: 'right',
              userSelect: 'none',
              opacity: 0.5,
              fontFamily: 'ui-monospace, monospace',
              minWidth: '1.5em',
            }}
          >
            {lines.map((_, i) => (
              <li key={`ln-${String(i)}`}>{i + 1}</li>
            ))}
          </ol>
        ) : null}
        <pre
          data-cir-part="codeblock-pre"
          style={{
            margin: 0,
            flex: 1,
            fontFamily: 'ui-monospace, monospace',
            whiteSpace: 'pre',
            overflowX: 'auto',
          }}
        >
          <code data-cir-part="codeblock-code">{code}</code>
        </pre>
      </div>
    </div>
  );
}

CodeBlock.displayName = 'CodeBlock';

/**
 * Plain-text fallback. Renders the source as a fenced markdown block when a
 * language is known, or as the raw source for `plaintext`. Accepts a partial
 * props bag so the universal text-render walker (which has no per-component
 * type information) cannot crash on a partially-populated node.
 */
export function codeBlockTextRender(props: Partial<CodeBlockProps>): string {
  const code = typeof props?.code === 'string' ? props.code : '';
  const language = props?.language ?? (code.length > 0 ? detectLanguage(code) : 'plaintext');
  if (code.length === 0) return `[CodeBlock: ${language}]`;
  if (language === 'plaintext') return code;
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

export const CodeBlockBinding: ComponentBinding = { id: 'CodeBlock', factory: CodeBlock };
