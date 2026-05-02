// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useViewTransition()` — imperative trigger for the View Transitions
 * API, gated on `prefers-reduced-motion` and browser support.
 *
 * Returns a stable function reference (cached for the component's
 * lifetime) so callers may pass it to event handlers without
 * resubscribing. The function is identical to the runtime's
 * `viewTransition(callback)` — exposed as a hook so React-only consumers
 * don't need to import from `@atelier/runtime` directly when working
 * with motion.
 *
 * Typical use:
 *   const startTransition = useViewTransition();
 *   const onArchive = () => startTransition(() => setArchived(true));
 */

import { useCallback } from 'react';
import { viewTransition } from '@atelier/runtime';

export function useViewTransition(): (callback: () => void | Promise<void>) => Promise<void> {
  return useCallback((callback) => viewTransition(callback), []);
}
