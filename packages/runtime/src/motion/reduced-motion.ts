// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `prefers-reduced-motion: reduce` detection.
 *
 * One-shot, non-reactive accessor. The reactive listener variant ships in
 * `@atelier/react`'s `useReducedMotion` hook — runtime callers that need to
 * decide "animate or not" at one point in time use this; React components
 * that need to re-render on OS preference change use the hook.
 *
 * SSR contract: returns `true` (i.e. "treat as reduced") when no `window`
 * is present. The conservative default keeps server-rendered markup
 * static and avoids the layout-shift class of bug where a component
 * renders a transition wrapper on the server then re-renders without it
 * once `matchMedia` settles in the client.
 *
 * Cf. `Tooltip.tsx` and `HoverCard.tsx` — both use the same pattern
 * inline; this module is the canonical home so future motion code shares
 * one source of truth.
 */

/** Reduced-motion media query string. Centralised so tests can match it. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Returns true if the user has expressed a preference for reduced
 * motion, OR if no DOM / matchMedia is available (SSR conservative
 * default).
 *
 * Cheap; safe to call on every animation-decision branch. Internally
 * dispatches to `window.matchMedia` per call so the result reflects the
 * OS preference at call time, not at module-init time.
 */
export function isReducedMotion(): boolean {
  const w = (globalThis as unknown as { window?: unknown }).window as
    | { matchMedia?: (query: string) => { matches: boolean } }
    | undefined;
  if (!w || typeof w.matchMedia !== 'function') {
    return true;
  }
  try {
    return w.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    // Some test environments (older happy-dom) throw on unrecognised
    // queries. Treat as "reduced" to keep the conservative default.
    return true;
  }
}
