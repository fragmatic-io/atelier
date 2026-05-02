// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wave 11 / Int-1 — shared phase machine for entry/exit animations,
 * private to `@atelier/components`.
 *
 * Mirrors `@atelier/react`'s `useTransition` shape (option / result
 * types) but is implemented here because `@atelier/components` sits
 * underneath `@atelier/react` in the dependency graph and cannot import
 * from it. App code should keep using `useTransition` from
 * `@atelier/react`; component-internal animations (Modal, Drawer,
 * HoverCard, Toast) consume this module instead so the four no longer
 * each carry their own copy of the phase logic.
 *
 * Phase machine (identical to the React-adapter hook):
 *   `exited` → (in=true) → `entering` → `entered`
 *   `entered` → (in=false) → `exiting` → `exited`
 *
 * Reduced motion: collapses durations to 0; the phase machine still
 * runs (so consumers' mount / unmount logic is unaffected) but no CSS
 * transition is emitted. Components that apply a `transform` (Modal's
 * scale-in, Drawer's slide-in) MUST gate it on the `reducedMotion`
 * flag the result exposes — same contract as the React hook.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  durationFor,
  isReducedMotion,
  readMotionTokens,
  type MotionSpeed,
  type TransitionPhase,
} from '@atelier/runtime';

/**
 * Optional per-call duration override. Same surface as the React-adapter
 * hook: a named speed from the brand kit, OR a raw ms number for the
 * (rarer) cases where the component declares a deviation from the
 * declared scale (e.g. `<Tooltip>`'s 100ms sticky window).
 */
export type TransitionDuration = MotionSpeed | number;

export interface UseComponentTransitionOptions {
  /** Mount/unmount latch. `true` ushers in; `false` ushers out. */
  in: boolean;
  /**
   * Speed name from the brand kit (`'fast' | 'normal' | 'slow'`) OR a
   * raw ms number. Defaults to `'normal'`.
   */
  duration?: TransitionDuration;
  /**
   * When `false`, the hook short-circuits the phase walk: `phase`
   * tracks `in` synchronously and `style` is empty. This is the seam
   * components use to keep `animated={false}` back-compatible — no
   * transition wrapper, no inline transition declarations, no risk of
   * test snapshots flipping.
   */
  enabled?: boolean;
}

export interface UseComponentTransitionResult {
  /** Current phase. Components key CSS off this (`data-transition-phase`). */
  phase: TransitionPhase['phase'];
  /** Inline style with `opacity` + `transition` resolved per the brand kit. */
  style: CSSProperties;
  /** Mirror of `isReducedMotion()` so consumers can gate `transform` too. */
  reducedMotion: boolean;
  /** Resolved duration in ms (0 under reduced motion / when `enabled` is false). */
  durationMs: number;
}

/** Resolve a `'fast' | 'normal' | 'slow'` name OR raw ms to ms. */
function resolveMs(d: TransitionDuration): number {
  if (typeof d === 'number') {
    return isReducedMotion() ? 0 : Math.max(0, Math.round(d));
  }
  return durationFor(d);
}

/**
 * Component-internal phase machine. App code should prefer
 * `useTransition` from `@atelier/react` (which adds reactivity to OS
 * preference changes via `useReducedMotion`); this hook uses the
 * runtime's non-reactive `isReducedMotion()` to keep the dependency
 * direction clean (`@atelier/components` cannot import the React adapter).
 */
export function useComponentTransition(
  opts: UseComponentTransitionOptions,
): UseComponentTransitionResult {
  const enabled = opts.enabled !== false;
  const speed: TransitionDuration = opts.duration ?? 'normal';
  const reducedMotion = isReducedMotion();

  const [phase, setPhase] = useState<TransitionPhase['phase']>(() => {
    if (!enabled) return opts.in ? 'entered' : 'exited';
    return opts.in ? 'entering' : 'exited';
  });
  const lastInRef = useRef<boolean>(opts.in);

  useEffect(() => {
    if (!enabled) {
      setPhase(opts.in ? 'entered' : 'exited');
      lastInRef.current = opts.in;
      return;
    }
    const ms = reducedMotion ? 0 : resolveMs(speed);
    if (opts.in && !lastInRef.current) {
      setPhase('entering');
      lastInRef.current = true;
      const t = setTimeout(() => setPhase('entered'), ms);
      return (): void => clearTimeout(t);
    }
    if (!opts.in && lastInRef.current) {
      setPhase('exiting');
      lastInRef.current = false;
      const t = setTimeout(() => setPhase('exited'), ms);
      return (): void => clearTimeout(t);
    }
    if (opts.in && phase === 'entering') {
      const t = setTimeout(() => setPhase('entered'), ms);
      return (): void => clearTimeout(t);
    }
    return undefined;
    // Phase intentionally excluded from deps — same rationale as the
    // React-adapter hook: this is a prop-flip effect, not a phase tick.
  }, [opts.in, enabled, speed, reducedMotion]);

  if (!enabled) {
    return { phase, style: {}, reducedMotion, durationMs: 0 };
  }

  const tokens = readMotionTokens();
  const easingOut = tokens.easing.out;
  const easingIn = tokens.easing.in;
  const ms = reducedMotion ? 0 : resolveMs(speed);
  const opacity = phase === 'entered' ? 1 : 0;
  const easing = phase === 'exiting' ? easingIn : easingOut;
  const style: CSSProperties = reducedMotion
    ? { opacity: phase === 'entered' ? 1 : 0 }
    : {
        opacity,
        transition: `opacity ${String(ms)}ms ${easing}, transform ${String(ms)}ms ${easing}`,
      };
  return { phase, style, reducedMotion, durationMs: ms };
}
