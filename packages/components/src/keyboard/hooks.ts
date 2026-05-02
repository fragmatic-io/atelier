// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * Keyboard registry hooks — Wave 11 / Int-3.
 *
 *  - `useKeyboard()` returns the active `KeyboardServices` (or `null` if no
 *    `<KeyboardProvider>` is in scope). Components that gracefully degrade
 *    on a missing provider call this directly.
 *  - `useKeyboardRegistry()` returns the registry or throws. Use when the
 *    component requires a registry to function.
 *  - `useKeyboardAction(action)` registers an action for the lifetime of the
 *    component, replacing the entry on prop changes and tearing it down on
 *    unmount.
 *  - `useKeyboardActions()` returns a re-render-on-change snapshot of all
 *    registered actions. Backed by `useSyncExternalStore` so the palette
 *    re-renders whenever a downstream component registers / unregisters.
 */

import { useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { KeyboardAction, KeyboardRegistry, KeyboardServices } from '@cir/keyboard';
import { KeyboardContext } from './context.js';

/** Returns the active services bag, or `null` when no provider is in scope. */
export function useKeyboard(): KeyboardServices | null {
  return useContext(KeyboardContext);
}

/**
 * Returns the active registry, or throws when no provider is in scope.
 * Use when the component cannot reasonably degrade.
 */
export function useKeyboardRegistry(): KeyboardRegistry {
  const ctx = useContext(KeyboardContext);
  if (!ctx) {
    throw new Error('useKeyboardRegistry(): no <KeyboardProvider> found in tree');
  }
  return ctx.registry;
}

/**
 * Register a `KeyboardAction` for the lifetime of the calling component.
 *
 * The action is re-registered (replacing the prior entry by id) whenever
 * any field on `action` changes — except `invoke`, which is captured via a
 * stable ref so callers don't have to memoize it. This mirrors the
 * conventional React pattern for event-callback registration:
 *
 * ```ts
 * const [open, setOpen] = useState(false);
 * useKeyboardAction({
 *   id: 'palette.open',
 *   label: 'Open palette',
 *   hotkey: 'cmd+k',
 *   invoke: () => setOpen(true),
 * });
 * ```
 *
 * If the host is not wrapping this subtree in `<KeyboardProvider>`, the
 * hook is a graceful no-op so libraries can register actions defensively.
 */
export function useKeyboardAction(action: KeyboardAction): void {
  const services = useKeyboard();
  // Stable ref to the latest invoke callback so we don't re-register on
  // every render just because the function identity changed.
  const invokeRef = useRef(action.invoke);
  invokeRef.current = action.invoke;

  useEffect(() => {
    if (!services) return;
    const wrapped: KeyboardAction = {
      ...action,
      invoke: () => invokeRef.current(),
    };
    const unregister = services.registry.register(wrapped);
    return () => {
      unregister();
    };
    // The action's identity-relevant fields change frequently (label, hotkey,
    // scope, group). We deliberately key the effect on each of them so a host
    // can update an action's hotkey at runtime without the registry going
    // stale. The `invoke` field is omitted — captured via the ref above.
  }, [
    services,
    action.id,
    action.label,
    action.description,
    action.hotkey,
    action.scope,
    action.group,
    action.icon,
    // `keywords` is an array; reference compare is good enough — hosts that
    // mutate the array will get a stale registration, but the convention
    // (`keywords: ['x', 'y']` literal) covers the 99% case.
    action.keywords,
  ]);
}

/**
 * Returns a re-render-on-change snapshot of all registered actions filtered
 * by scope. Powered by `useSyncExternalStore` so external mutations
 * propagate without prop-drilling.
 *
 * Returns an empty array when no provider is in scope (palettes degrade
 * gracefully).
 */
export function useKeyboardActions(scope?: 'global' | 'route'): readonly KeyboardAction[] {
  const services = useKeyboard();
  return useSyncExternalStore(
    (cb) => {
      if (!services) return () => undefined;
      return services.registry.subscribe(cb);
    },
    () => (services ? services.registry.list(scope) : EMPTY),
    // Server snapshot — the same as the client snapshot at SSR time.
    () => (services ? services.registry.list(scope) : EMPTY),
  );
}

const EMPTY: readonly KeyboardAction[] = Object.freeze([]);
