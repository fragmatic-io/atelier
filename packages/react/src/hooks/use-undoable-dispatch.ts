// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * `useUndoableDispatch()` — a `useDispatcher`-shaped hook that ALSO tracks
 * the open `undo_token` from the most recent undoable dispatch and exposes
 * it as `undoToast` state, suitable for handing to `<Toast variant="undo">`.
 *
 * Behaviour:
 *  - Returns `dispatch(capabilityId, input)` exactly like `useDispatcher()`.
 *  - When the dispatch resolves with `undo_token`, sets `undoToast` to
 *    `{ message, undoToken, expiresAt, windowMs, onUndo, onClose }` so the
 *    host can render a Toast directly without any additional plumbing.
 *  - The default toast message is `"<capability_id> — undo within Ns"`. Hosts
 *    can override per-call via the `messageFor` option.
 *  - When the user clicks Undo, the hook calls
 *    `dispatcher.undoFromToken(token)` and clears `undoToast`. Audit events
 *    (`action.undoable_window_open`, `action.undone`,
 *    `action.undo_window_expired`) flow through the runtime's audit sink as
 *    usual; this hook does NOT subscribe to the audit stream — the toast
 *    state is driven directly off the dispatch return value.
 *
 * Why not subscribe to `action.undoable_window_open`? The dispatch return
 * value is already the source of truth (it carries the token, expiry, and
 * window). Subscribing would just add a race for the same data. Audit
 * subscribers (DebugPanel, dashboards) still see every event.
 */

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ActionResult, UndoResult } from '@cir/runtime';
import { useCir } from './use-cir.js';
import { CurrentManifestContext } from '../context/manifest-context.js';

export interface UndoToastState {
  /** Human-readable message — drop into `<Toast message=...>`. */
  message: string;
  /** Undo token to feed to `<Toast undoToken=...>`. */
  undoToken: string;
  /** ISO 8601 expiry — drop into `<Toast expiresAt=...>`. */
  expiresAt: string;
  /** Total window in ms — drop into `<Toast windowMs=...>`. */
  windowMs: number;
  /**
   * Click-Undo handler — bound to call `dispatcher.undoFromToken(token)`
   * and clear the toast state. Drop into `<Toast onUndo=...>`.
   */
  onUndo: () => Promise<UndoResult | null>;
  /** Manual dismiss — clears the toast state. Drop into `<Toast onClose=...>`. */
  onClose: () => void;
  /** Capability id that produced this toast. Useful for instrumentation. */
  capabilityId: string;
}

export interface UseUndoableDispatchOptions {
  /**
   * Build the toast message for a given capability + result. Default:
   * `"<capabilityId> — undo within <Ns>"`.
   */
  messageFor?: (capabilityId: string, result: ActionResult) => string;
}

export interface UseUndoableDispatchResult {
  /** Dispatch a capability — same contract as `useDispatcher()`. */
  dispatch: (capabilityId: string, input: unknown) => Promise<ActionResult>;
  /**
   * The currently-open undo toast, or `null` when no undoable dispatch is
   * pending. Replaced wholesale on each new undoable dispatch (so a second
   * archive while the first toast is up swaps to the new one — Linear's
   * "rolling" behaviour).
   */
  undoToast: UndoToastState | null;
}

const FALLBACK_WINDOW_MS = 5000;

function defaultMessageFor(capabilityId: string, result: ActionResult): string {
  const seconds = Math.round((result.undo_window_ms ?? FALLBACK_WINDOW_MS) / 1000);
  return `${capabilityId} — undo within ${String(seconds)}s`;
}

export function useUndoableDispatch(
  opts: UseUndoableDispatchOptions = {},
): UseUndoableDispatchResult {
  const services = useCir();
  const current = useContext(CurrentManifestContext);
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);

  // Keep latest opts/services in refs so `dispatch` does not re-create.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Track the active token so a stale-toast race never reverses a token
  // that was already redeemed by a later dispatch overwriting state.
  const activeTokenRef = useRef<string | null>(null);
  // Cleanup on unmount: clear active token so any in-flight onUndo is a no-op.
  useEffect(() => {
    return () => {
      activeTokenRef.current = null;
    };
  }, []);

  const dispatch = useCallback(
    async (capabilityId: string, input: unknown): Promise<ActionResult> => {
      const ctx = {
        user_id: services.identity.user_id,
        app_id: services.identity.app_id,
        ...(current?.manifest_id ? { manifest_id: current.manifest_id } : {}),
      };
      const result = await services.dispatcher.dispatch(capabilityId, input, ctx);
      if (result.ok && result.undo_token && result.undo_expires_at) {
        const token = result.undo_token;
        activeTokenRef.current = token;
        const buildMessage = optsRef.current.messageFor ?? defaultMessageFor;
        const windowMs = result.undo_window_ms ?? FALLBACK_WINDOW_MS;
        const onUndo = async (): Promise<UndoResult | null> => {
          if (activeTokenRef.current !== token) return null;
          activeTokenRef.current = null;
          try {
            const undone = await services.dispatcher.undoFromToken(token);
            setUndoToast(null);
            return undone;
          } catch {
            // Window expired or unknown token — clear the toast quietly.
            setUndoToast(null);
            return null;
          }
        };
        const onClose = (): void => {
          if (activeTokenRef.current === token) {
            activeTokenRef.current = null;
          }
          setUndoToast(null);
        };
        setUndoToast({
          message: buildMessage(capabilityId, result),
          undoToken: token,
          expiresAt: result.undo_expires_at,
          windowMs,
          onUndo,
          onClose,
          capabilityId,
        });
      }
      return result;
    },
    [services, current?.manifest_id],
  );

  return { dispatch, undoToast };
}
