// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * CodeBlock — code surface with auto-detected language label, copy-to-
 * clipboard button, and optional gutter line numbers. Wraps `<CodeView>`
 * for the actual code rendering — when `language` is set, `<CodeView>`
 * lazy-loads Shiki and swaps in syntax-highlighted HTML (Wave 11 / Cnt-1).
 *
 * Pre-Cnt-1 this component owned its own `<pre>`; that body now lives in
 * `<CodeView>` so highlighting / folding / line refs are inherited from
 * a single render path. The chrome (toolbar, language pill, copy button)
 * stays here because it is `<CodeBlock>`-specific.
 *
 * Design notes:
 *  - Copy button uses `navigator.clipboard.writeText` and falls back to a
 *    hidden `<textarea>` + `document.execCommand('copy')` for older browsers
 *    and HTTP-only contexts where the async clipboard API is unavailable.
 *  - The "copied" affordance is a checkmark that auto-reverts after 1500ms;
 *    the timer is cleared on unmount so a tear-down mid-flight does not
 *    set state on a dead component.
 *  - `data-color-mode="dark"` on any ancestor flips the surface tokens to
 *    light-on-dark via the variant table (Tailwind hosts pick this up; non-
 *    Tailwind hosts can target `[data-cir-component="CodeBlock"]` directly).
 *
 * Markdown integration site: a future `<Markdown>` triple-backtick fence
 * renderer should call into `<CodeBlock>` directly — pass the fence body as
 * `code` and the fence info-string as `language` (or omit to let detection
 * run). We deliberately do not modify `<Markdown>` here; that's tracked
 * separately as track Cnt-5.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { detectLanguage, type DetectedLanguage } from '../lib/detect-language.js';
import { CodeView } from './CodeView.js';
import { DEFAULT_SHIKI_THEME, type ShikiThemePair } from '../code/shiki.js';
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
  /**
   * Wave 11 / Cnt-1: Shiki theme pair, forwarded to the inner `<CodeView>`.
   * Defaults to GitHub light + dark; CSS picks one per `[data-color-mode]`.
   */
  theme?: ShikiThemePair;
  /**
   * Wave 11 / Cnt-1: when true and lines > 20, show a collapse/expand toggle.
   * Mirrors Vercel deploy-log behaviour.
   */
  foldable?: boolean;
  /** Wave 11 / Cnt-1: lines (1-indexed) to mark with `data-highlight="true"`. */
  highlightLines?: readonly number[];
  /**
   * Wave 11 / Cnt-1: when true, every line gets `id="L<n>"` for `#L42`-style
   * anchor deep-links (Vercel / GitHub contract).
   */
  linkLines?: boolean;
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
  theme = DEFAULT_SHIKI_THEME,
  foldable = false,
  highlightLines,
  linkLines = false,
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
      <CodeView
        code={code}
        // CodeView's `language` is a Shiki grammar id string, distinct from
        // the DetectedLanguage union. `'plaintext'` short-circuits highlighting
        // so we map it to `''` (no-language) for the inner component.
        language={resolved === 'plaintext' ? '' : resolved}
        showLineNumbers={showLineNumbers}
        theme={theme}
        foldable={foldable}
        // `highlightLines` is conditionally spread because `exactOptionalPropertyTypes`
        // forbids passing literal `undefined` for an optional prop. Same shape
        // as the surrounding component-prop forwarding patterns in this package.
        {...(highlightLines !== undefined ? { highlightLines } : {})}
        linkLines={linkLines}
        // Forward the variant axis so styling stays consistent. The CodeView
        // and CodeBlock variant tables happen to share the `default` /
        // `embedded` keys; future divergence can map explicitly.
        variant={variant === 'embedded' ? 'embedded' : 'default'}
      />
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
