// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * `useOptimisticAction()` — a small hook that standardizes the optimistic-UI
 * pattern across CIR components.
 *
 * Components like `DecisionQueue` and `TaskQueue` hand-rolled their own
 * "apply locally → call action → on failure roll back, on success show toast"
 * loop. This hook collapses that into one place so:
 *  1. Optimistic updates land before the network call.
 *  2. Rollback runs whenever the action returns `ok: false` or throws.
 *  3. A `busy` flag is exposed for buttons that want to disable themselves.
 *  4. Success/error toasts auto-clear after `toastTimeoutMs`.
 *
 * The hook is intentionally schema-agnostic: callers parameterize over
 * `TInput` so they keep their own type for the action input.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionResult } from '@cir/runtime';

export interface UseOptimisticActionOptions<TInput> {
  /** The action callback (typically wired by the render walker). */
  action: ((input: TInput) => Promise<ActionResult>) | undefined;
  /** Apply the optimistic mutation locally. Called BEFORE the network call. */
  applyOptimistic?: (input: TInput) => void;
  /** Roll back the local mutation if the action fails. */
  rollback?: (input: TInput) => void;
  /** Auto-clear the toast after this many ms. Default 2000. */
  toastTimeoutMs?: number;
}

export interface UseOptimisticActionResult<TInput> {
  invoke: (input: TInput) => Promise<ActionResult | null>;
  busy: boolean;
  /** Last toast message (success or error) — null when no toast. */
  toast: { kind: 'success' | 'error'; message: string } | null;
}

const DEFAULT_TOAST_TIMEOUT_MS = 2000;

export function useOptimisticAction<TInput>(
  opts: UseOptimisticActionOptions<TInput>,
): UseOptimisticActionResult<TInput> {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutMs = opts.toastTimeoutMs ?? DEFAULT_TOAST_TIMEOUT_MS;

  // Latest opts in a ref so `invoke` doesn't need to be re-created when the
  // caller passes inline closures every render.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const showToast = useCallback(
    (kind: 'success' | 'error', message: string) => {
      setToast({ kind, message });
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, timeoutMs);
    },
    [timeoutMs],
  );

  // Cleanup the pending timeout on unmount so we don't setState a stale tree.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const invoke = useCallback(
    async (input: TInput): Promise<ActionResult | null> => {
      const { action, applyOptimistic, rollback } = optsRef.current;
      if (!action) return null;

      applyOptimistic?.(input);
      setBusy(true);
      try {
        const result = await action(input);
        if (result.ok) {
          showToast('success', 'Done');
          return result;
        }
        rollback?.(input);
        showToast('error', result.error ?? 'Action failed');
        return result;
      } catch (err) {
        rollback?.(input);
        const message = err instanceof Error ? err.message : 'Action failed';
        showToast('error', message);
        return { ok: false, error: message };
      } finally {
        setBusy(false);
      }
    },
    [showToast],
  );

  return { invoke, busy, toast };
}
