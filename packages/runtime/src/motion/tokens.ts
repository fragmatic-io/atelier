// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Motion tokens — read durations + easing curves from the host's CSS
 * variables (projected from `BrandKit.motion`), with Atelier-default
 * fallbacks for SSR / non-DOM contexts and for hosts that do not declare
 * a motion scale.
 *
 * The CSS variable bridge is one-way: hosts mirror their brand kit's
 * `motion.duration_scale` + `motion.easing` to `--cir-duration-*` /
 * `--cir-easing-*` (matching the Vis-1 / Vis-7 patterns elsewhere in
 * `globals.css`). The runtime never writes those variables — that's the
 * compile / scaffold step's job.
 *
 * `readMotionTokens()` parses the `ms` suffix off duration variables and
 * coerces to integer milliseconds. Invalid / missing values fall back to
 * the Atelier defaults (Linear-tight: 100 / 160 / 240 ms; Material-style
 * easing curves).
 *
 * Why a runtime layer at all? The CSS variables are great for components
 * that style themselves declaratively, but JS-driven motion (View
 * Transitions API, `setTimeout`-based exit animations, Web Animations
 * API) needs the numeric ms value. This module is the seam.
 */

import { isReducedMotion } from './reduced-motion.js';

/** Default speed names. Mirrors `BrandMotion.duration_scale`'s canonical keys. */
export type MotionSpeed = 'fast' | 'normal' | 'slow';

/** Default easing names. Mirrors `BrandMotion.easing`'s canonical keys. */
export type MotionEasing = 'in_out' | 'out' | 'in' | 'spring';

export interface MotionDurations {
  fast: number;
  normal: number;
  slow: number;
}

export interface MotionEasings {
  in_out: string;
  out: string;
  in: string;
  spring: string;
}

export interface MotionTokens {
  duration: MotionDurations;
  easing: MotionEasings;
}

/**
 * Atelier defaults — Linear-tight scale + Material-style easing.
 * Used when no CSS variables are set or the runtime is in an SSR /
 * non-DOM context.
 */
export const MOTION_DEFAULTS: Readonly<MotionTokens> = Object.freeze({
  duration: Object.freeze({
    fast: 100,
    normal: 160,
    slow: 240,
  }),
  easing: Object.freeze({
    in_out: 'cubic-bezier(0.4, 0, 0.2, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
  }),
});

/**
 * Browser-only access guard. Mirrors the pattern used in
 * `@atelier/components`'s tooltip / hover-card primitives — the runtime
 * is import-safe in SSR; the actual DOM read only fires when called from
 * a browser callback.
 */
function hasDom(): boolean {
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  return g.window !== undefined && g.document !== undefined;
}

/** Parse `100ms` / `0.16s` / `120` → integer ms. NaN / invalid → fallback. */
function parseDurationMs(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  // `Xms` (e.g. `120ms`) — strip suffix.
  if (trimmed.endsWith('ms')) {
    const n = Number(trimmed.slice(0, -2));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
  }
  // `Xs` (e.g. `0.2s`) — convert to ms.
  if (trimmed.endsWith('s')) {
    const n = Number(trimmed.slice(0, -1));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : fallback;
  }
  // Bare number — assume ms.
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function readVar(name: string): string {
  if (!hasDom()) return '';
  const g = globalThis as unknown as {
    getComputedStyle?: (el: unknown) => { getPropertyValue: (n: string) => string };
    window?: { getComputedStyle?: (el: unknown) => { getPropertyValue: (n: string) => string } };
    document?: { documentElement?: unknown };
  };
  // Prefer `globalThis.getComputedStyle` (real browser globals) but fall
  // back to `window.getComputedStyle` for tests that nest it.
  const compute = g.getComputedStyle ?? g.window?.getComputedStyle;
  const docEl = g.document?.documentElement;
  if (typeof compute !== 'function' || docEl === undefined) return '';
  return compute(docEl).getPropertyValue(name);
}

/**
 * Read the motion tokens currently in effect on `:root`. Falls back to
 * `MOTION_DEFAULTS` for any variable that is unset / SSR / unparseable.
 *
 * In SSR / non-DOM contexts this returns `MOTION_DEFAULTS` verbatim, so
 * server renders never throw. The result is a fresh object — callers
 * may mutate it without polluting the defaults.
 */
export function readMotionTokens(): MotionTokens {
  if (!hasDom()) {
    return {
      duration: { ...MOTION_DEFAULTS.duration },
      easing: { ...MOTION_DEFAULTS.easing },
    };
  }
  const fast = parseDurationMs(readVar('--cir-duration-fast'), MOTION_DEFAULTS.duration.fast);
  const normal = parseDurationMs(readVar('--cir-duration-normal'), MOTION_DEFAULTS.duration.normal);
  const slow = parseDurationMs(readVar('--cir-duration-slow'), MOTION_DEFAULTS.duration.slow);
  const inOut = readVar('--cir-easing-in-out').trim() || MOTION_DEFAULTS.easing.in_out;
  const out = readVar('--cir-easing-out').trim() || MOTION_DEFAULTS.easing.out;
  const inE = readVar('--cir-easing-in').trim() || MOTION_DEFAULTS.easing.in;
  const spring = readVar('--cir-easing-spring').trim() || MOTION_DEFAULTS.easing.spring;
  return {
    duration: { fast, normal, slow },
    easing: { in_out: inOut, out, in: inE, spring },
  };
}

/**
 * Resolved duration in ms. Returns `0` under reduced-motion regardless of
 * the underlying token — this is the canonical seam JS-driven motion
 * code should use to decide whether to animate at all.
 */
export function durationFor(speed: MotionSpeed): number {
  if (isReducedMotion()) return 0;
  return readMotionTokens().duration[speed];
}
