// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 7 / P-7 — runtime motion primitives.
 *
 * The CSS variable bridge (`--cir-duration-*`, `--cir-easing-*`) is the
 * declarative half. This module is the imperative half — JS-driven
 * motion code reads tokens, gates on reduced-motion, and wraps state
 * transitions in the View Transitions API where supported.
 *
 * Surface (re-exported from `@atelier/runtime`):
 *  - `readMotionTokens()`        — read the in-effect motion scale
 *  - `durationFor(speed)`        — resolved duration in ms (0 if reduced)
 *  - `isReducedMotion()`         — non-reactive matchMedia check
 *  - `viewTransition(callback)`  — View Transitions API wrapper
 *  - `MOTION_DEFAULTS`           — Atelier-default tokens (Linear-tight)
 *
 * Wave 11 / Int-1 will build on this layer (per-component data-update
 * shimmer, count tick-up easing, etc.). The split is deliberate —
 * P-7 ships the foundation; Int-1 generalises the existing one-off
 * Tooltip / HoverCard / Toast transitions onto it.
 */

export {
  MOTION_DEFAULTS,
  durationFor,
  readMotionTokens,
  type MotionDurations,
  type MotionEasing,
  type MotionEasings,
  type MotionSpeed,
  type MotionTokens,
} from './tokens.js';
export { REDUCED_MOTION_QUERY, isReducedMotion } from './reduced-motion.js';
export { viewTransition, type TransitionPhase } from './view-transition.js';
