// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * View Transitions API wrapper.
 *
 * `viewTransition(callback)` runs the callback inside
 * `document.startViewTransition()` when the browser supports it AND the
 * user has not requested reduced motion. Otherwise it falls back to
 * `await callback()`, preserving the same `Promise<void>` contract so
 * callers don't branch.
 *
 * The browser's API takes a sync callback returning either `void` or a
 * `Promise`; we accept both and forward the `.finished` promise so
 * callers can `await` the full transition (including the cross-fade).
 *
 * `entering` / `exiting` phase typing lives here too — `useTransition`
 * (the React hook) re-exports it via a barrel so consumers have one
 * place to import from.
 */

import { isReducedMotion } from './reduced-motion.js';

/**
 * Mount/unmount lifecycle phase, useful for entry/exit CSS-driven
 * animations. Components that don't rely on `startViewTransition` lean
 * on this state machine instead — `useTransition` walks an element
 * through all four phases on `in: true` → `in: false` flips.
 */
export interface TransitionPhase {
  phase: 'entering' | 'entered' | 'exiting' | 'exited';
}

/** Subset of the WHATWG ViewTransition API we depend on. */
interface ViewTransitionLike {
  finished: Promise<void>;
}

interface DocumentWithViewTransition {
  startViewTransition: (callback: () => void | Promise<void>) => ViewTransitionLike;
}

function supportsViewTransitions(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as unknown as Partial<DocumentWithViewTransition>;
  return typeof d.startViewTransition === 'function';
}

/**
 * Run `callback` inside a View Transition where supported, else just
 * `await` it directly. Always resolves once the transition (or callback)
 * finishes. Honours `prefers-reduced-motion: reduce` (skips the
 * transition wrapper, runs the callback plainly).
 *
 * Errors thrown by the callback propagate. View-transition rejections
 * (e.g. a same-frame second call) are swallowed — the callback's own
 * resolution is the canonical signal for callers.
 */
export async function viewTransition(callback: () => void | Promise<void>): Promise<void> {
  if (!supportsViewTransitions() || isReducedMotion()) {
    await callback();
    return;
  }
  const d = document as unknown as DocumentWithViewTransition;
  const transition = d.startViewTransition(callback);
  try {
    await transition.finished;
  } catch {
    // The transition can be skipped (e.g. interrupted by another) —
    // the callback has run, which is what callers care about.
  }
}
