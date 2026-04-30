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
 *
 * Wave 7a / Int-4 — capability autodetect:
 * Hosts can now pass the action's `capability`. When the capability has
 * BOTH `reversible: true` AND `low_stakes: true`, the hook engages the
 * optimistic apply/rollback path automatically — the host does NOT need
 * to set an opt-in flag. When either flag is missing, the hook falls
 * through to a pessimistic path: `applyOptimistic` is NOT called and
 * `rollback` is NOT called either, even if those callbacks were passed.
 *
 * Backwards compatibility: when no `capability` is supplied, the hook
 * behaves exactly as before — `applyOptimistic` is always called, and
 * `rollback` always runs on failure. Existing callers (DecisionQueue,
 * TaskQueue) continue to work unchanged.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionResult } from '@cir/runtime';
import type { Capability } from '@cir/schemas';

export interface UseOptimisticActionOptions<TInput> {
  /** The action callback (typically wired by the render walker). */
  action: ((input: TInput) => Promise<ActionResult>) | undefined;
  /**
   * The action's capability declaration. When present and the capability
   * has both `reversible: true` and `low_stakes: true`, the hook engages
   * optimistic UI automatically. When absent (legacy callers), the hook
   * always engages optimistic UI.
   */
  capability?: Capability;
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

/**
 * Decide whether the hook should run in optimistic mode for a given
 * capability. The autodetect rule mirrors the runtime's
 * `optimisticDispatch()` — both flags must be true. When no capability is
 * passed (legacy callers, hand-wired components), assume optimistic mode
 * so existing components keep working.
 */
function isOptimistic(capability: Capability | undefined): boolean {
  if (!capability) return true;
  return capability.reversible === true && capability.low_stakes === true;
}

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
      const { action, applyOptimistic, rollback, capability } = optsRef.current;
      if (!action) return null;

      // Autodetect: only engage the optimistic apply/rollback callbacks when
      // the capability declares it (or when no capability is passed — legacy
      // path). For pessimistic capabilities the network round-trip is the
      // user-visible signal of the action landing.
      const optimistic = isOptimistic(capability);

      if (optimistic) applyOptimistic?.(input);
      setBusy(true);
      try {
        const result = await action(input);
        if (result.ok) {
          showToast('success', 'Done');
          return result;
        }
        if (optimistic) rollback?.(input);
        showToast('error', result.error ?? 'Action failed');
        return result;
      } catch (err) {
        if (optimistic) rollback?.(input);
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
