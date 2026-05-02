// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `withUndo()` — middleware wrapper for `ActionDispatcher` that emits an
 * undo-toast notice for every successful undoable dispatch.
 *
 * Wave 11 / Int-8. The dispatcher already mints the `undo_token` and
 * tracks the expiry window (see `actions/dispatcher.ts` —
 * `action.undoable_window_open`). This wrapper is the user-visible
 * counterpart: each dispatch that resolves with an `undo_token` is forwarded
 * to a host-supplied `UndoToastEmitter`, which mounts a `<Toast variant="undo">`
 * (or any UI affordance the host chooses) and binds the `undo()` callback
 * back to `inner.undoFromToken(token)`.
 *
 * Mirrors the wrapper pattern shipped in:
 *  - `BudgetMeteredCompiler` (`packages/compiler/src/budget-meter.ts` — S-6)
 *  - `ValidationFeedbackCompiler` (C-1) — same "decorate-an-existing-instance"
 *    shape, no inheritance, no global state.
 *
 * The wrapper is structurally compatible with `ActionDispatcher`'s public
 * surface — `dispatch`, `undo`, `canUndo`, `undoFromToken` etc. all proxy
 * through. Hosts can swap a wrapped dispatcher into the `CirRuntime` services
 * bag without any other call-site change.
 *
 * ETHOS principle 4 (constrained surface): the host declares `<UndoToast>`
 * once at the React root, the middleware fires the affordance from the
 * runtime layer, and the policy engine accepts the `UNDO_TOAST_AMBIENT_SATISFIER`
 * declaration as coverage. No per-route plumbing.
 */

import type { Capability } from '@cir/schemas';
import type {
  ActionDispatcher,
  ActionExecutionContext,
  ActionResult,
  UndoResult,
} from './dispatcher.js';

/**
 * Notice fired by `withUndo()` to the host emitter when a dispatch resolves
 * with an open undo window. The host renders this as a `<Toast variant="undo">`
 * (or any equivalent UI affordance) and wires the `Undo` button to
 * `handle.undo()`.
 */
export interface UndoToastNotice {
  /** The capability id that was just dispatched. */
  actionId: string;
  /** The capability id of the rollback. */
  rollbackId: string;
  /** Open token returned by `dispatcher.dispatch()` — feed to `undoFromToken()`. */
  undoToken: string;
  /** Total window in ms (capability-declared or `DEFAULT_UNDO_WINDOW_MS`). */
  windowMs: number;
  /** ISO 8601 expiry timestamp. */
  expiresAt: string;
  /** The original input payload (forwarded for host-side display only). */
  payload?: unknown;
}

/**
 * Handle returned by `UndoToastEmitter.show()`. The middleware does not
 * inspect the handle — it is purely the contract between the emitter and
 * its host UI. Hosts that build a custom emitter can use this shape to
 * support imperative dismissal / programmatic undo.
 */
export interface UndoHandle {
  /** Trigger the undo path; resolves with the rollback `UndoResult`. */
  undo: () => Promise<UndoResult | null>;
  /** Dismiss the toast without undoing. */
  dismiss: () => void;
  /** Remaining time in ms before auto-dismiss. */
  remainingMs: () => number;
}

/**
 * Host emitter that renders an undo affordance per notice. The middleware
 * calls `show(notice)` once per successful undoable dispatch.
 *
 * Hosts can implement this by:
 *  - Mounting a `<ToastSinkProvider>` and using the `useUndoToastEmitter()`
 *    hook from `@cir/react` (the recommended path).
 *  - Routing notices into an existing notification system (Sonner, etc.).
 *  - Logging them for tests / headless runs (see `with-undo.test.ts`).
 */
export interface UndoToastEmitter {
  show(notice: UndoToastNotice): UndoHandle;
}

/** Options passed to `withUndo()`. */
export interface WithUndoOptions {
  /** The dispatcher being wrapped. */
  inner: ActionDispatcher;
  /** Capabilities the dispatcher knows about (for `undoable` lookup). */
  capabilities: Record<string, Capability>;
  /** Host emitter — receives a notice per successful undoable dispatch. */
  emitter: UndoToastEmitter;
  /**
   * Optional map of capability id → undo-payload deriver. Some rollbacks need
   * a different payload than the forward action (e.g. `task.delete` ≠
   * `task.create_from_thread` — the rollback wants `{ task_id }`, the
   * forward action carried `{ thread_id }`). Hosts that need a transform
   * register it here. Default: pass-through (the dispatcher already stores
   * the original input on the undo entry).
   *
   * Returning `undefined` falls back to the dispatcher's stored input.
   */
  derivePayload?: (capabilityId: string, originalPayload: unknown) => unknown;
}

/**
 * Structural interface of the wrapped dispatcher. Identical to
 * `ActionDispatcher`'s public methods. Returned as a plain object with
 * bound methods so it slots into the `CirRuntime` services bag as a
 * drop-in replacement.
 *
 * Why not extend `ActionDispatcher`? The wrapper holds no per-instance
 * state of its own — it delegates to `inner` and just intercepts the
 * `dispatch()` return. Subclassing would expose the inner's private
 * fields (`#openTokens`, `#undoStack`) which we want to keep out of the
 * middleware's blast radius.
 */
export type WrappedDispatcher = ActionDispatcher;

/**
 * Wrap an `ActionDispatcher` so successful undoable dispatches fan out to
 * an emitter. The wrapped dispatcher is API-compatible with the inner one;
 * all other methods (`undo`, `canUndo`, `undoFromToken`, `undoStackSize`,
 * `openUndoTokenCount`, `peekUndoToken`) proxy through unchanged.
 *
 * On the dispatch path:
 *  1. Forward to `inner.dispatch(capabilityId, input, ctx)`.
 *  2. If the result has `ok: true` AND `undo_token` AND the capability
 *     declares `undoable: true` AND a `rollback`: build a notice and call
 *     `emitter.show(notice)`. Errors thrown by the emitter are swallowed
 *     and logged via `console.warn` — a misbehaving toast UI must NEVER
 *     break the action path. The user's mutation already landed.
 *  3. Otherwise: return the result unchanged.
 *
 * Failure paths (`ok: false`, thrown handler) skip the emitter — no toast
 * for an action that did not commit.
 */
export function withUndo(opts: WithUndoOptions): WrappedDispatcher {
  const { inner, capabilities, emitter, derivePayload } = opts;

  // We return a Proxy so the wrapped dispatcher passes `instanceof ActionDispatcher`
  // checks AND so unknown methods (future dispatcher additions) are
  // forwarded automatically without recompiling the middleware.
  const handler: ProxyHandler<ActionDispatcher> = {
    get(target, prop, receiver) {
      if (prop === 'dispatch') {
        return async function dispatch(
          capabilityId: string,
          input: unknown,
          ctx: ActionExecutionContext,
        ): Promise<ActionResult> {
          const result = await target.dispatch(capabilityId, input, ctx);
          if (
            result.ok &&
            result.undo_token &&
            result.undo_expires_at &&
            result.undo_window_ms !== undefined
          ) {
            const capability = capabilities[capabilityId];
            // Only emit if the capability actually opted in. The dispatcher
            // is defensive — it only mints a token when `undoable: true`
            // AND `reversible: true` AND a rollback is declared — but we
            // re-check here to keep the contract local-and-readable.
            if (capability?.undoable === true && capability.rollback) {
              const token = result.undo_token;
              const notice: UndoToastNotice = {
                actionId: capabilityId,
                rollbackId: capability.rollback,
                undoToken: token,
                windowMs: result.undo_window_ms,
                expiresAt: result.undo_expires_at,
                payload: derivePayload?.(capabilityId, input) ?? input,
              };
              try {
                emitter.show(notice);
              } catch (err) {
                // Emitter failures must not break the action path. The
                // mutation has already committed; the worst case is a
                // missed toast. Log so a flaky toast UI is observable.
                console.warn('[cir] withUndo emitter threw', err);
              }
            }
          }
          return result;
        };
      }
      // All other methods proxy directly. Arrow-rebind the function so
      // `this` stays pointed at the inner instance (some methods read
      // `this.#…` private fields and would otherwise throw).
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  };

  return new Proxy(inner, handler);
}

/**
 * Test-only — a no-op emitter that records every notice. Useful for
 * verifying middleware fan-out without rendering a real toast.
 */
export function recordingEmitter(): UndoToastEmitter & {
  notices: UndoToastNotice[];
  handles: UndoHandle[];
} {
  const notices: UndoToastNotice[] = [];
  const handles: UndoHandle[] = [];
  return {
    notices,
    handles,
    show(notice) {
      notices.push(notice);
      const handle: UndoHandle = {
        // eslint-disable-next-line @typescript-eslint/require-await
        undo: async () => null,
        dismiss: () => undefined,
        remainingMs: () => notice.windowMs,
      };
      handles.push(handle);
      return handle;
    },
  };
}
