// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * `useReactConfirmation()` — wires `ActionDispatcher`'s `ConfirmationCallback`
 * to a React-rendered modal portal.
 *
 * Returns:
 *  - `confirm` — a `ConfirmationCallback` the caller passes to
 *    `ActionDispatcher`. Calling it enqueues a request and returns a promise
 *    that resolves once the user confirms/cancels in the portal UI.
 *  - `Portal` — a component the host renders inside the provider tree.
 *
 * Implementation notes:
 *  - We back the queue with a tiny external store (`useSyncExternalStore`).
 *    A custom store is simpler than React state because the `confirm`
 *    callback is invoked from outside React (the dispatcher's async path).
 *  - Only one modal is shown at a time. Subsequent requests sit in a queue
 *    until the head resolves. This keeps the UX predictable.
 *  - Cancel paths (escape, the cancel button) all resolve with
 *    `confirmed: false`.
 */

import { useMemo } from 'react';
import type { ConfirmationCallback, ConfirmationDecision } from '@cir/runtime';
import { ConfirmPortal } from './confirm-portal.js';
import { createConfirmStore, type ConfirmStore } from './confirm-store.js';

export interface UseReactConfirmation {
  confirm: ConfirmationCallback;
  Portal: React.FC;
}

export function useReactConfirmation(): UseReactConfirmation {
  // One store per hook invocation. The provider wires this to a single
  // portal, so calling the hook again gives an isolated queue.
  const store = useMemo<ConfirmStore>(() => createConfirmStore(), []);

  const confirm: ConfirmationCallback = useMemo(
    () => (req) =>
      new Promise<ConfirmationDecision>((resolve) => {
        store.enqueue({ request: req, resolve });
      }),
    [store],
  );

  const Portal: React.FC = useMemo(() => {
    const Bound: React.FC = () => <ConfirmPortal store={store} />;
    Bound.displayName = 'CirConfirmPortal';
    return Bound;
  }, [store]);

  return { confirm, Portal };
}
