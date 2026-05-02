// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
'use client';
/**
 * `useHighlightedCode` — React hook around the lazy Shiki bridge.
 *
 * Returns a discriminated state suitable for an SSR-safe render path:
 *
 *   - `'pending'` — Shiki is still loading or tokenising; render the raw
 *     code in a `<pre>` (no layout shift when we swap in the highlighted
 *     HTML afterwards).
 *   - `'ready'` — `light` / `dark` HTML strings are populated; render both
 *     with `dangerouslySetInnerHTML` and let CSS pick one per
 *     `data-color-mode`.
 *   - `'error'` — Shiki isn't installed or the grammar/theme couldn't load.
 *     Caller falls back to the same plain `<pre>` render as `'pending'` —
 *     the error state is a signal "stop waiting", not a different render.
 *
 * The hook re-runs the highlight when ANY of `code` / `language` /
 * `theme.light` / `theme.dark` change. An `AbortController` lets a
 * superseding render cancel the stale promise so we never `setState` on an
 * unmounted (or out-of-date) component.
 *
 * SSR note: this hook does nothing on the server (the `useEffect` doesn't
 * fire). The component renders the `'pending'` state — a plain `<pre>` —
 * which hydrates without mismatch, then swaps in the highlighted HTML on
 * the client. No `useSyncExternalStore` plumbing required.
 */
import { useEffect, useState } from 'react';
import { highlight, type ShikiHighlightResult, type ShikiThemePair } from './shiki.js';

/** Discriminated render state — see file-level doc-comment. */
export type HighlightedCodeState =
  | { state: 'pending' }
  | { state: 'ready'; light: string; dark: string }
  | { state: 'error'; error: Error };

/**
 * Render-time hook. Pass `language=''` to skip highlighting entirely (the
 * hook returns `'pending'` and never resolves — the component renders raw
 * code, same as today's behaviour).
 */
export function useHighlightedCode(
  code: string,
  language: string,
  theme: ShikiThemePair,
): HighlightedCodeState {
  const [state, setState] = useState<HighlightedCodeState>({ state: 'pending' });

  useEffect(() => {
    // Skip the highlight entirely when no language is set — the component
    // already has back-compat plain-text behaviour for that path.
    if (!language) {
      setState({ state: 'pending' });
      return;
    }

    const ac = new AbortController();
    setState({ state: 'pending' });

    highlight(code, language, theme).then(
      (result: ShikiHighlightResult) => {
        if (ac.signal.aborted) return;
        setState({ state: 'ready', light: result.light, dark: result.dark });
      },
      (err: unknown) => {
        if (ac.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ state: 'error', error });
      },
    );

    return (): void => {
      ac.abort();
    };
    // The four primitives below cover every meaningful change: theme is
    // shallowly compared on the two string fields so we don't need a deep-
    // equal helper.
  }, [code, language, theme.light, theme.dark]);

  return state;
}
