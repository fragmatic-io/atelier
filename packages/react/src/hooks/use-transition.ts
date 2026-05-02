// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useTransition({ in, duration })` — entry/exit phase machine for
 * mount/unmount animations, paired with the motion CSS variable bridge.
 *
 * The hook walks an element through four phases:
 *   `exited` → (in=true) → `entering` → `entered`
 *   `entered` → (in=false) → `exiting` → `exited`
 *
 * Consumers spread `style` onto the animated element. The hook emits
 * `opacity` / `transition` declarations only — components apply
 * `transform` (modal scale-in, drawer slide-in) themselves via a
 * `data-transition-phase` selector. The split keeps the hook tiny and
 * reusable; per-component motion grammar lives with the component.
 *
 * Reduced motion: when `useReducedMotion()` returns true, durations
 * collapse to 0 — the phase machine still runs (so consumers' mount /
 * unmount logic is unaffected) but the CSS transition produces no
 * animation. Components SHOULD also gate their `transform` on the
 * reduced-motion flag (or set `transform: none` for the `entering` /
 * `exiting` phases). The hook exposes the flag via the return value so
 * components don't need to import it twice.
 *
 * Why not React 18's `useTransition`? Different concept entirely — the
 * built-in hook gates state updates as concurrent. This one drives the
 * entry/exit visual lifecycle.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  durationFor,
  readMotionTokens,
  type MotionSpeed,
  type TransitionPhase,
} from '@atelier/runtime';
import { useReducedMotion } from './use-reduced-motion.js';

export interface UseTransitionOptions {
  /** Mount/unmount latch. `true` ushers in; `false` ushers out. */
  in: boolean;
  /**
   * Speed name from the brand-kit's `motion.duration_scale`. Defaults to
   * `'normal'` (160 ms in the Atelier defaults; 100 / 240 for fast / slow).
   */
  duration?: MotionSpeed;
}

export interface UseTransitionResult {
  /** Current phase. Components key CSS off this (`data-transition-phase`). */
  phase: TransitionPhase['phase'];
  /** Inline style with `opacity` + `transition` resolved per the brand kit. */
  style: CSSProperties;
  /** Mirror of `useReducedMotion()` so consumers can gate `transform` too. */
  reducedMotion: boolean;
  /** Resolved duration in ms (0 under reduced motion). */
  durationMs: number;
}

export function useTransition(opts: UseTransitionOptions): UseTransitionResult {
  const speed: MotionSpeed = opts.duration ?? 'normal';
  const reducedMotion = useReducedMotion();
  // `phase` reflects the *visible* state. Initial mount with `in: true`
  // starts at `entering` so the first paint applies the off-state, then
  // commits to `entered` on the next frame.
  const [phase, setPhase] = useState<TransitionPhase['phase']>(() =>
    opts.in ? 'entering' : 'exited',
  );
  const lastInRef = useRef<boolean>(opts.in);

  useEffect(() => {
    const ms = reducedMotion ? 0 : durationFor(speed);
    if (opts.in && !lastInRef.current) {
      // Off → on: start at `entering`, commit to `entered`.
      setPhase('entering');
      lastInRef.current = true;
      const t = setTimeout(() => setPhase('entered'), ms);
      return (): void => clearTimeout(t);
    }
    if (!opts.in && lastInRef.current) {
      // On → off: `entered` → `exiting` → `exited`.
      setPhase('exiting');
      lastInRef.current = false;
      const t = setTimeout(() => setPhase('exited'), ms);
      return (): void => clearTimeout(t);
    }
    // Same-as-last: settle initial mount.
    if (opts.in && phase === 'entering') {
      const t = setTimeout(() => setPhase('entered'), ms);
      return (): void => clearTimeout(t);
    }
    return undefined;
    // We deliberately exclude `phase` from deps — it's a state-effect on
    // *prop* flips, not on every phase change.
  }, [opts.in, speed, reducedMotion]);

  // Read tokens once per render. Cheap (one getComputedStyle call per
  // animated element), and the result is stable for any given mode.
  const tokens = readMotionTokens();
  const easingOut = tokens.easing.out;
  const easingIn = tokens.easing.in;
  const ms = reducedMotion ? 0 : tokens.duration[speed];

  const opacity = phase === 'entered' ? 1 : phase === 'entering' ? 0 : phase === 'exiting' ? 0 : 0;
  const easing = phase === 'exiting' ? easingIn : easingOut;
  const style: CSSProperties = reducedMotion
    ? { opacity: phase === 'exited' ? 0 : 1 }
    : {
        opacity,
        transition: `opacity ${ms}ms ${easing}, transform ${ms}ms ${easing}`,
      };

  return { phase, style, reducedMotion, durationMs: ms };
}
