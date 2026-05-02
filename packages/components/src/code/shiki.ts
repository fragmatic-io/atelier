// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Lazy Shiki bridge for `<CodeView>` / `<CodeBlock>`.
 *
 * Wave 11 / Cnt-1 picks Shiki as the canonical syntax-highlighter (it's the
 * de-facto standard — Astro, VS Code, the TC39 docs all use it, and it
 * tree-shakes per-language so we don't pay the full ~200KB grammar set unless
 * the host actually renders that language).
 *
 * Design constraints, in priority order:
 *   1. **Optional peer dep.** Hosts that never render code should not be
 *      forced to install Shiki. The `await import('shiki')` here is the only
 *      reference to the package — when it isn't installed the import rejects
 *      and the React layer (`useHighlightedCode`) flips to its `'error'`
 *      state, which the components render as plain text. Zero crash.
 *   2. **Lazy grammar load.** `createHighlighter({ langs: [] })` boots empty;
 *      every distinct language hits `loadLanguage(lang)` exactly once and is
 *      memoised in `loadedLangs`. Switching themes does not re-create the
 *      highlighter; switching languages just appends to the existing one.
 *   3. **Singleton.** A single `Highlighter` instance lives for the lifetime
 *      of the page — Shiki's WASM oniguruma init is the slow path, so we pay
 *      it once. The cache is process-scoped, not request-scoped; SSR hosts
 *      that need per-request isolation should clear via `clearShikiCache()`.
 *   4. **HTML-safe output.** Shiki's `codeToHtml` returns a fully-formed
 *      `<pre><code>…</code></pre>` string with HTML-entity-escaped tokens.
 *      The component injects it via `dangerouslySetInnerHTML` — safe because
 *      Shiki escapes by construction (no raw user code reaches the DOM as
 *      markup). Documented as a contract in the component doc-comments.
 *
 * Surface kept tiny on purpose: one `highlight()` entry point + one
 * `clearShikiCache()` for tests. Anything more (multi-theme blends,
 * transformers) is out-of-scope for Cnt-1 and lands in follow-on tickets.
 */

/** Theme pair — Shiki theme ids (e.g. `'github-light'` / `'github-dark'`). */
export interface ShikiThemePair {
  light: string;
  dark: string;
}

/** Output of {@link highlight} — pre-baked HTML strings for both themes. */
export interface ShikiHighlightResult {
  light: string;
  dark: string;
}

/**
 * Minimal duck-typed shape of the Shiki highlighter we actually call. Keeping
 * this local (instead of `import type { Highlighter } from 'shiki'`) means
 * the package builds with zero references to the shiki types — important
 * because shiki is an OPTIONAL peer dep and may not be installed.
 */
interface ShikiHighlighter {
  loadLanguage: (lang: string) => Promise<void>;
  loadTheme: (theme: string) => Promise<void>;
  codeToHtml: (code: string, opts: { lang: string; theme: string }) => string;
}

interface ShikiModule {
  createHighlighter: (opts: {
    themes: readonly string[];
    langs: readonly string[];
  }) => Promise<ShikiHighlighter>;
}

/**
 * Module-level singleton. Holds the Shiki Highlighter once Shiki has loaded
 * and the first language has been registered. `null` until first use OR
 * after `clearShikiCache()`.
 */
let highlighter: ShikiHighlighter | null = null;

/** Memo of grammars already registered so we never `loadLanguage` twice. */
const loadedLangs = new Set<string>();

/** Memo of theme ids loaded into the singleton highlighter. */
const loadedThemes = new Set<string>();

/**
 * Load the Shiki module dynamically. Throws if Shiki isn't installed; the
 * caller (`useHighlightedCode`) catches and falls back to plain text render.
 *
 * Exposed as a separate function so tests can `vi.mock('shiki', …)` to swap
 * in a stub without touching the module-level singleton.
 */
async function importShiki(): Promise<ShikiModule> {
  // Cast via `unknown` because the real Shiki types use `BundledTheme` /
  // `BundledLanguage` literal unions; we duck-type to plain strings so the
  // optional peer dep stays optional. Runtime shape matches.
  const mod: unknown = await import(/* @vite-ignore */ 'shiki');
  return mod as ShikiModule;
}

/**
 * Ensure the singleton highlighter exists and the requested language + theme
 * pair are loaded. Idempotent — safe to call once per render.
 */
async function ensureShiki(theme: ShikiThemePair, lang: string): Promise<void> {
  const shiki = await importShiki();
  if (!highlighter) {
    highlighter = await shiki.createHighlighter({
      themes: [theme.light, theme.dark],
      langs: [],
    });
    loadedThemes.add(theme.light);
    loadedThemes.add(theme.dark);
  }
  // Theme switch on an existing highlighter — Shiki supports adding themes
  // post-init via `loadTheme`. Older versions of Shiki used a different name;
  // we narrow at call-site so a missing method just throws and the React
  // layer falls back to plain text.
  if (!loadedThemes.has(theme.light)) {
    await highlighter.loadTheme(theme.light);
    loadedThemes.add(theme.light);
  }
  if (!loadedThemes.has(theme.dark)) {
    await highlighter.loadTheme(theme.dark);
    loadedThemes.add(theme.dark);
  }
  if (!loadedLangs.has(lang)) {
    await highlighter.loadLanguage(lang);
    loadedLangs.add(lang);
  }
}

/**
 * Tokenise + render `code` as a pair of `<pre><code>` HTML strings, one per
 * theme. The dual-render mirrors the Vis-2 dark-mode pattern: the component
 * emits BOTH and CSS picks one based on `[data-color-mode]` so dark-mode
 * toggling never re-renders the syntax-highlighted block.
 *
 * Throws if Shiki isn't installed or the requested grammar/theme can't load.
 * The component layer treats any thrown error as "fall back to plain text".
 */
export async function highlight(
  code: string,
  language: string,
  theme: ShikiThemePair,
): Promise<ShikiHighlightResult> {
  await ensureShiki(theme, language);
  // Non-null after `ensureShiki` resolved.
  const h = highlighter as ShikiHighlighter;
  return {
    light: h.codeToHtml(code, { lang: language, theme: theme.light }),
    dark: h.codeToHtml(code, { lang: language, theme: theme.dark }),
  };
}

/**
 * Test-only escape hatch. Drops the singleton + memos so a `vi.mock('shiki')`
 * call in one test doesn't leak into the next. Production code must never
 * call this — losing the cached highlighter forces a full WASM re-init.
 */
export function clearShikiCache(): void {
  highlighter = null;
  loadedLangs.clear();
  loadedThemes.clear();
}

/** Default theme pair — paired GitHub light/dark, matches Vis-2 surface. */
export const DEFAULT_SHIKI_THEME: ShikiThemePair = Object.freeze({
  light: 'github-light',
  dark: 'github-dark',
});
