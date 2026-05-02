// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useShimmerOnChange(value, durationMs?)` — Wave 11 / Int-1.
 *
 * Returns an `opacity` value that ramps from `0.6` → `1` linearly over
 * `durationMs` (default 600) on first render AND every time `value`
 * changes. Designed for "row just updated" affordances on `<List>` /
 * `<Queue>` / `<Table>` rows: the brief opacity dip + restore reads as
 * "this row's data was refreshed" without the user reading a copy
 * change.
 *
 * Reduced motion: returns `1` immediately. The user has expressed a
 * preference for static UI; shimmer should not fire.
 *
 * SSR contract: returns `1` until the first client effect fires
 * (mirrors the conservative default in `useReducedMotion` — server
 * renders are never partial-opacity).
 *
 * Lifecycle:
 *   - First render: opacity steps from 0.6 → 1 over `durationMs`.
 *   - `value` changes: same ramp restarts.
 *   - `durationMs <= 0`: opacity stays at `1`.
 *   - Unmount mid-ramp: rAF cancelled cleanly.
 *
 * Pairs with the row-appear keyframe in the host's `globals.css` (see
 * `cir-row-appear` in the Int-1 CSS scaffold). Hosts that want to
 * style on the shimmer state directly can read the returned value and
 * apply it inline; the `<List animateRowAppear>` opt-in does this
 * via `data-cir-new` instead, which is simpler.
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './use-reduced-motion.js';

const DEFAULT_DURATION_MS = 600;
const SHIMMER_FROM = 0.6;
const SHIMMER_TO = 1;

export function useShimmerOnChange(
  value: unknown,
  durationMs: number = DEFAULT_DURATION_MS,
): number {
  const reducedMotion = useReducedMotion();
  // Start at 1 — server-rendered content is never partial-opacity. The
  // first client effect kicks the ramp.
  const [opacity, setOpacity] = useState<number>(SHIMMER_TO);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion || durationMs <= 0) {
      setOpacity(SHIMMER_TO);
      return;
    }
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setOpacity(SHIMMER_TO);
      return;
    }
    const start =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    setOpacity(SHIMMER_FROM);

    const tick = (): void => {
      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      const t = Math.min(1, (now - start) / durationMs);
      // Linear ramp 0.6 → 1.
      const next = SHIMMER_FROM + (SHIMMER_TO - SHIMMER_FROM) * t;
      setOpacity(next);
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return (): void => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, durationMs, reducedMotion]);

  return opacity;
}
