// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useTweenNumber(target, durationMs?)` — Wave 11 / Int-1.
 *
 * Eases the displayed number from the current value to `target` via
 * `easeOutQuad` over `durationMs` (default 300). Designed for the
 * "count tick-up" affordance on `<MetaBadge>` / `<KPIRow>` /
 * `<StatCard>`: when a backing number changes the displayed value
 * animates up rather than snapping.
 *
 * The first render returns `target` verbatim — there is no prior value
 * to ease from on initial mount, and snapping a zero-state into a
 * fast-tween would read as a glitch. Subsequent target changes ease
 * from the previously displayed value.
 *
 * Reduced motion: returns `target` immediately.
 *
 * SSR contract: returns `target` until the first client effect fires
 * (server renders never show in-progress tween values).
 *
 * Cleanup: rAF cancelled on unmount AND whenever `target` flips
 * mid-tween (the next effect run starts a fresh ease).
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './use-reduced-motion.js';

const DEFAULT_DURATION_MS = 300;

/** `easeOutQuad` — gentle deceleration; reads as "settled" by the end. */
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function useTweenNumber(target: number, durationMs: number = DEFAULT_DURATION_MS): number {
  const reducedMotion = useReducedMotion();
  // Initial render: snap to target. The mount effect is the seam; we
  // never animate FROM zero on first paint.
  const [displayed, setDisplayed] = useState<number>(target);
  // Track the displayed value imperatively too so the rAF tick can
  // start from "what the user sees right now" even if `target` changes
  // mid-tween.
  const displayedRef = useRef<number>(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion || durationMs <= 0) {
      setDisplayed(target);
      displayedRef.current = target;
      return;
    }
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setDisplayed(target);
      displayedRef.current = target;
      return;
    }
    const start =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const from = displayedRef.current;
    if (from === target) {
      // Nothing to ease — short-circuit so we don't burn rAF frames.
      return;
    }

    const tick = (): void => {
      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      const t = Math.min(1, (now - start) / durationMs);
      const eased = easeOutQuad(t);
      const next = from + (target - from) * eased;
      displayedRef.current = next;
      if (t >= 1) {
        // Land exactly on target — eliminates fractional-pixel drift.
        setDisplayed(target);
        displayedRef.current = target;
        rafRef.current = null;
        return;
      }
      setDisplayed(next);
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return (): void => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, durationMs, reducedMotion]);

  return displayed;
}
