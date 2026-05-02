// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useDataPulse(value, windowMs?)` — Wave 11 / Int-1 data-update animation hook.
 *
 * Returns the number of ms elapsed since `value` last changed, ticking via
 * `requestAnimationFrame` until `windowMs` is exceeded. After the window
 * elapses returns `Infinity`, signalling "no longer pulsing" so consumers
 * can drop animation classes / data attrs without setting a separate
 * timeout.
 *
 * Use case: row-shimmer on update, badge pulse on count increment, the
 * count-tick-up window in `<MetaBadge>`. Pairs with the runtime's motion
 * tokens — the default 600ms window is roughly `slow` × 2.5, the rough
 * "feel" budget for a single pulse before it becomes a distraction.
 *
 * Behaviour:
 *  - `value` change → resets the timer to 0; rAF starts ticking.
 *  - During the window: returns the live elapsed ms.
 *  - After the window OR under `prefers-reduced-motion`: returns `Infinity`.
 *
 * SSR contract: returns `Infinity` until the first client effect fires
 * (mirrors the conservative default in `useReducedMotion`). Components
 * gate their pulse styling on `< Infinity`.
 *
 * Reduced motion: returns `Infinity` immediately. The user has expressed
 * a preference for static UI; pulse should not fire.
 *
 * Cleanup: the rAF handle is cancelled on unmount AND whenever `value`
 * changes (the next effect run starts a fresh ticker).
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './use-reduced-motion.js';

/** Default window: 600ms — slightly past `MOTION_DEFAULTS.duration.slow * 2`. */
const DEFAULT_WINDOW_MS = 600;

export function useDataPulse(value: unknown, windowMs: number = DEFAULT_WINDOW_MS): number {
  const reducedMotion = useReducedMotion();
  // Initial state: `Infinity` until the first effect resolves so server
  // renders never animate.
  const [elapsed, setElapsed] = useState<number>(Infinity);
  // Persist the previous value across renders so we can detect changes
  // without re-running the effect on EVERY render. `Object.is` is the
  // same equality React uses for `useState`.
  const lastValueRef = useRef<unknown>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion || windowMs <= 0) {
      setElapsed(Infinity);
      return;
    }
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      // No rAF (SSR or stripped-down test env) — nothing to tick. Treat
      // as `Infinity` so consumers behave as if the window already closed.
      setElapsed(Infinity);
      return;
    }
    // Reset on value change. The change-detect lives in the effect (not
    // the render body) so we don't double-fire under React StrictMode's
    // double-mount in dev.
    lastValueRef.current = value;
    const start =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    setElapsed(0);

    const tick = (): void => {
      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      const since = now - start;
      if (since >= windowMs) {
        setElapsed(Infinity);
        rafRef.current = null;
        return;
      }
      setElapsed(since);
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return (): void => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, windowMs, reducedMotion]);

  return elapsed;
}
