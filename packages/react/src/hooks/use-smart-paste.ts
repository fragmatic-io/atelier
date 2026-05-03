// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useSmartPaste()` — Wave 11 / Int-15.
 *
 * Smart paste with link unfurl. When the user pastes text into a
 * `<RichText>` / `<Form>` field that opted in (`pasteSmart={…}`), this hook
 * scans the clipboard text for the first URL, hands it to the host's
 * `EmbedRegistry` (Cnt-4), and surfaces the resolved display payload to the
 * caller via `onPaste({ text, unfurled })`. Notion + Slack reference: a
 * pasted YouTube link becomes an embedded video card; a pasted Loom /
 * Figma / GitHub URL becomes a thumbnail card; a plain string passes
 * through untouched.
 *
 * Why duplicate `EmbedRegistry` / `EmbedDisplay` shapes here?
 * ----------------------------------------------------------
 * The canonical types live in `@atelier/components/embeds/{registry,resolver}.ts`
 * alongside the visual `<Embed>`. `@atelier/react` deliberately does NOT
 * take a runtime dependency on `@atelier/components` (mirrors the
 * `useUndoToastEmitter` + `useTrail` precedents — pulling components would
 * drag in `lucide-react`, `react-markdown`, etc. for every adapter
 * consumer). Both definitions are structural-type-compatible — passing
 * an `EmbedRegistry` from `@atelier/components` to this hook typechecks
 * by shape.
 *
 * Timeout contract
 * ----------------
 * Async resolvers (the oEmbed fallback) hit the network — we don't want
 * the user to stare at a "Pasting…" spinner if the upstream is slow. The
 * `unfurlTimeoutMs` option (default `1500`) bounds the wait: if the
 * registry hasn't resolved by then, we fire `onPaste` with the raw text
 * (`unfurled` undefined) and let the late resolution land in a no-op
 * (the latest-key ref pattern in `<Embed>` handles the same race for
 * inline rendering). Sync resolvers (YouTube / Loom / Figma) microtask
 * back well under any reasonable timeout — only true network resolvers
 * trip the fallback.
 *
 * Why the first URL only?
 * -----------------------
 * Pasting a paragraph that mentions multiple URLs is the common case
 * ("see foo.com/bar and bar.com/baz"). Unfurling all of them inside a
 * single paste event would (a) require coordinating N parallel
 * `registry.resolve` calls against the timeout and (b) leave the host
 * with an awkward `unfurled[]` payload it has to splice back into the
 * text. Slack and Notion both unfurl the FIRST detected URL on paste,
 * with manual unfurl on subsequent links — we follow the same model.
 * Hosts that want richer behaviour can call `registry.resolve` directly.
 *
 * SSR / server contract
 * ---------------------
 * The returned `onPasteHandler` is a no-op-safe callback (it doesn't
 * touch `window` directly). Hosts that build event handlers during SSR
 * still get a stable callback; the `e.clipboardData` read happens at
 * actual paste time, which only fires in the browser.
 */

import { useCallback, useRef } from 'react';

/**
 * Structural mirror of `EmbedDisplay` from
 * `@atelier/components/embeds/resolver`. Defined here too so the React
 * adapter stays free of a runtime dep on `@atelier/components`.
 * Cross-package usage is type-compatible by shape.
 */
export interface EmbedDisplay {
  kind: 'video' | 'card' | 'iframe' | 'oembed';
  title?: string;
  thumbnail?: string;
  description?: string;
  iframeSrc?: string;
  width?: number;
  height?: number;
  html?: string;
}

/**
 * Structural mirror of `EmbedRegistry` from
 * `@atelier/components/embeds/registry`. `useSmartPaste` only needs the
 * `resolve` half of the surface — `add` is a host-side concern.
 */
export interface EmbedRegistry {
  resolve(url: string): Promise<{ provider: string; display: EmbedDisplay } | null>;
}

/**
 * The shape forwarded to the caller's `onPaste`. `text` is the raw
 * clipboard string (always present). `unfurled` is set when a URL inside
 * the text resolved through the registry within the timeout.
 */
export interface PasteEvent {
  text: string;
  unfurled?: { url: string; display: EmbedDisplay };
}

export interface SmartPasteOptions {
  /** Cnt-4 registry — resolves URL → display. */
  embedRegistry: EmbedRegistry;
  /** Caller receives the raw text + (when resolved) the unfurled embed. */
  onPaste: (event: PasteEvent) => void;
  /**
   * If the clipboard contains a URL, wait up to this many ms for the
   * registry to resolve before firing `onPaste` with raw text. Defaults
   * to 1500. `<= 0` disables unfurl entirely (raw text always).
   */
  unfurlTimeoutMs?: number;
}

export interface UseSmartPasteResult {
  /**
   * Bind to a `<div onPaste={…}>` (or any element accepting clipboard
   * events). Accepts both the browser-native `ClipboardEvent` and React's
   * synthetic equivalent so hosts can wire it on either surface.
   */
  onPasteHandler: (e: ClipboardEvent | React.ClipboardEvent) => void;
}

const DEFAULT_TIMEOUT_MS = 1500;

/**
 * Detect the first URL in a string. Matches `http://` and `https://`
 * schemes — the only schemes the embed resolvers handle today. Stops at
 * whitespace / common trailing punctuation so prose like
 * "see https://example.com." doesn't include the trailing period.
 *
 * Exported for testing — hosts that want their own URL detection should
 * implement it on top of `registry.resolve` directly rather than reach
 * past this hook's surface.
 */
export function detectFirstUrl(text: string): string | null {
  // Conservative regex: scheme + at least one non-whitespace character.
  // Trailing punctuation (`.`, `,`, `;`, `:`, `!`, `?`, `)`, `]`, `}`) is
  // trimmed because that's prose, not part of the URL.
  const match = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (match === null) return null;
  let url = match[0];
  // Strip trailing prose punctuation (NOT closing parens — those need
  // balance-checking against the opening paren so a Wikipedia-style
  // `foo_(bar)` stays intact).
  url = url.replace(/[.,;:!?\]}]+$/u, '');
  // Strip an unmatched trailing `)` only when there's no opening `(` in
  // the URL — that's "see (https://example.com)" prose, not a balanced
  // path segment.
  while (url.endsWith(')') && !url.slice(0, -1).includes('(')) {
    url = url.slice(0, -1);
    // After dropping, fresh prose punctuation may surface.
    url = url.replace(/[.,;:!?\]}]+$/u, '');
  }
  return url.length > 0 ? url : null;
}

/**
 * Read the clipboard text from a paste event. React's synthetic event
 * exposes `clipboardData` directly; the browser-native event does too.
 * Returns `''` when no plain text is on the clipboard (e.g. image-only
 * paste).
 */
function readClipboardText(e: ClipboardEvent | React.ClipboardEvent): string {
  // `React.ClipboardEvent` has `clipboardData: DataTransfer` on its type;
  // browser-native `ClipboardEvent` has `clipboardData: DataTransfer | null`.
  // Treat them uniformly.
  const data = (e as ClipboardEvent).clipboardData;
  if (data === null || data === undefined) return '';
  try {
    return data.getData('text/plain') ?? '';
  } catch {
    return '';
  }
}

/**
 * Race a promise against a timeout. Resolves to `null` if the timeout
 * fires first; otherwise resolves to the upstream value (which may itself
 * be `null`).
 */
function raceTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  if (timeoutMs <= 0) return Promise.resolve(null);
  return new Promise<T | null>((resolve) => {
    let settled = false;
    const finish = (v: T | null): void => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer =
      typeof window !== 'undefined' && typeof window.setTimeout === 'function'
        ? window.setTimeout(() => finish(null), timeoutMs)
        : setTimeout(() => finish(null), timeoutMs);
    promise.then(
      (value) => {
        // Clear the timer in both env shapes.
        if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
          window.clearTimeout(timer as number);
        } else {
          clearTimeout(timer as ReturnType<typeof setTimeout>);
        }
        finish(value);
      },
      () => {
        if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
          window.clearTimeout(timer as number);
        } else {
          clearTimeout(timer as ReturnType<typeof setTimeout>);
        }
        finish(null);
      },
    );
  });
}

/**
 * Returns `{ onPasteHandler }`. Bind the handler to your editable
 * surface's `onPaste`. The hook does NOT call `e.preventDefault()` — the
 * caller decides whether to keep, replace, or augment the default paste
 * behaviour based on whether `unfurled` came back.
 */
export function useSmartPaste(opts: SmartPasteOptions): UseSmartPasteResult {
  const { embedRegistry, onPaste, unfurlTimeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  // Stable refs so the returned handler identity doesn't churn when the
  // caller passes a fresh `onPaste` each render. Hosts wiring this into
  // a memoised component still get a stable handler reference.
  const onPasteRef = useRef(onPaste);
  onPasteRef.current = onPaste;
  const registryRef = useRef(embedRegistry);
  registryRef.current = embedRegistry;
  const timeoutRef = useRef(unfurlTimeoutMs);
  timeoutRef.current = unfurlTimeoutMs;

  const onPasteHandler = useCallback((e: ClipboardEvent | React.ClipboardEvent): void => {
    const text = readClipboardText(e);
    if (text.length === 0) {
      onPasteRef.current({ text });
      return;
    }
    const url = detectFirstUrl(text);
    if (url === null || timeoutRef.current <= 0) {
      onPasteRef.current({ text });
      return;
    }
    // Kick the registry; race against the configured timeout. Resolution
    // path:
    //  - resolved within timeout → fire onPaste with `unfurled`
    //  - registry returned null / rejected / timed out → fire onPaste raw
    void raceTimeout(registryRef.current.resolve(url), timeoutRef.current).then((resolved) => {
      if (resolved === null) {
        onPasteRef.current({ text });
        return;
      }
      onPasteRef.current({ text, unfurled: { url, display: resolved.display } });
    });
  }, []);

  return { onPasteHandler };
}
