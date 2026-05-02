// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useReducedMotion()` — reactive `prefers-reduced-motion: reduce` listener.
 *
 * Subscribes to `MediaQueryList.change` for the lifetime of the calling
 * component, so updates to the OS preference (rare, but possible mid-
 * session) re-render consumers. Mirrors the runtime's `isReducedMotion()`
 * for the initial value, then keeps in sync via `addEventListener('change')`.
 *
 * SSR contract: returns `true` (matches the runtime's conservative
 * default) until the first client-side effect fires. Components that
 * gate on this hook will never animate during hydration — this is
 * deliberate; the alternative is a flash of motion before the OS
 * preference resolves.
 */

import { useEffect, useState } from 'react';
import { REDUCED_MOTION_QUERY, isReducedMotion } from '@atelier/runtime';

export function useReducedMotion(): boolean {
  // Start with the conservative default; the effect below corrects on mount.
  const [reduced, setReduced] = useState<boolean>(() => isReducedMotion());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(REDUCED_MOTION_QUERY);
    } catch {
      return;
    }
    setReduced(mql.matches);
    const onChange = (ev: MediaQueryListEvent): void => {
      setReduced(ev.matches);
    };
    // `addEventListener` is the modern API; older WebKit aliases it to
    // `addListener`. The current happy-dom + every shipping browser
    // honour the modern one.
    mql.addEventListener('change', onChange);
    return (): void => {
      mql.removeEventListener('change', onChange);
    };
  }, []);

  return reduced;
}
