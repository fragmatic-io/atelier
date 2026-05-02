// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useUndoToastEmitter()` — Wave 11 / Int-8.
 *
 * A React-side host for the runtime's `withUndo()` middleware. Returns an
 * `UndoToastEmitter` (the contract `withUndo()` consumes) backed by a tiny
 * external store, plus a `<Sink>` component the host mounts once at the
 * React root. Each `emitter.show(notice)` enqueues a notice; the sink
 * renders one inline undo toast per active notice, stacked at bottom-right.
 *
 * Mirrors the shape of `useReactConfirmation()` (same external-store +
 * imperative-callback + paired `<Portal>` pattern) so hosts that already
 * mount `<Portal />` in `atelier-providers.tsx` can mount `<Sink />` next to
 * it without any new mental model.
 *
 * The sink renders an inline minimal undo affordance (countdown + Undo
 * button + dismiss). Hosts that want the canonical `@atelier/components`
 * `<Toast variant="undo">` can import that component and assemble their
 * own sink — this hook's sink is intentionally dep-free so `@atelier/react`
 * stays a pure adapter (no runtime dependency on `@atelier/components`).
 *
 * Why an external store? `withUndo()` calls `emitter.show()` from outside
 * React (the dispatcher's async path). Calling React state setters from
 * there is unsound — the external store + `useSyncExternalStore` keeps
 * the data flow in spec.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type {
  ActionDispatcher,
  UndoHandle,
  UndoResult,
  UndoToastEmitter,
  UndoToastNotice,
} from '@atelier/runtime';
import { useCir } from './use-cir.js';

interface ActiveNotice {
  id: string;
  notice: UndoToastNotice;
  /** Used by the sink to fire `dispatcher.undoFromToken` AND clear state. */
  handle: UndoHandle;
  /** Wall-clock ms when the notice landed in the sink. */
  startedAt: number;
}

/** External store for the active toasts. */
interface ToastSinkStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly ActiveNotice[];
  push(notice: UndoToastNotice, dispatcher: ActionDispatcher): UndoHandle;
  remove(id: string): void;
  /** Test helper. */
  size(): number;
}

let nextId = 0;
function uniqueId(): string {
  nextId += 1;
  return `undo-toast-${String(nextId)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createToastSinkStore(): ToastSinkStore {
  let active: ActiveNotice[] = [];
  // Frozen snapshot so React's reference-equality check fires on every push.
  let snapshot: readonly ActiveNotice[] = Object.freeze([]);
  const listeners = new Set<() => void>();
  const notify = (): void => {
    snapshot = Object.freeze([...active]);
    for (const l of listeners) l();
  };
  return {
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    push(notice, dispatcher) {
      const id = uniqueId();
      const startedAt = Date.now();
      const handle: UndoHandle = {
        async undo() {
          const stillActive = active.find((a) => a.id === id);
          if (!stillActive) return null;
          // Remove first so the toast disappears optimistically; if the
          // dispatcher rejects (window expired), the audit log still
          // records the attempt and the user sees the toast vanish.
          active = active.filter((a) => a.id !== id);
          notify();
          try {
            const undone: UndoResult = await dispatcher.undoFromToken(notice.undoToken);
            return undone;
          } catch {
            return null;
          }
        },
        dismiss() {
          active = active.filter((a) => a.id !== id);
          notify();
        },
        remainingMs() {
          return Math.max(0, notice.windowMs - (Date.now() - startedAt));
        },
      };
      active = [...active, { id, notice, handle, startedAt }];
      notify();
      return handle;
    },
    remove(id) {
      active = active.filter((a) => a.id !== id);
      notify();
    },
    size() {
      return active.length;
    },
  };
}

export interface UseUndoToastEmitter {
  /** The emitter — pass into `withUndo({ emitter })`. */
  emitter: UndoToastEmitter;
  /** Mount once at the React root inside `<CirRuntime>`. */
  Sink: React.FC;
}

/**
 * Returns an `UndoToastEmitter` plus a `<Sink>` React component that hosts
 * one inline undo toast per active notice. Reads the dispatcher from the
 * surrounding `<CirRuntime>` provider — the wrapped dispatcher (created via
 * `withUndo()`) MUST be the one in the services bag for `undoFromToken()`
 * to find the open token.
 */
export function useUndoToastEmitter(): UseUndoToastEmitter {
  const services = useCir();
  const dispatcher = services.dispatcher;
  const store = useMemo<ToastSinkStore>(() => createToastSinkStore(), []);

  const emitter: UndoToastEmitter = useMemo(
    () => ({
      show(notice) {
        return store.push(notice, dispatcher);
      },
    }),
    [store, dispatcher],
  );

  const Sink: React.FC = useMemo(() => {
    const Bound: React.FC = () => <UndoToastSink store={store} />;
    Bound.displayName = 'CirUndoToastSink';
    return Bound;
  }, [store]);

  return { emitter, Sink };
}

/**
 * Variant of `useUndoToastEmitter()` that lets the caller pass the
 * dispatcher in directly. Used inside the same `useMemo` where the host
 * builds `withUndo({ ... })` — pulling the dispatcher from `useCir()` would
 * be a circular dep at construction time. The bare-store path lets the
 * host wire the emitter, the wrapped dispatcher, and the services bag in
 * one shot.
 *
 * Returns the same `{ emitter, Sink }` shape as `useUndoToastEmitter()`.
 * The `Sink` is a stable component — call this OUTSIDE React render
 * (e.g. inside a `useMemo` or module init) and reuse the returned
 * components across renders.
 */
export function createUndoToastEmitter(dispatcher: ActionDispatcher): UseUndoToastEmitter {
  const store = createToastSinkStore();
  const emitter: UndoToastEmitter = {
    show(notice) {
      return store.push(notice, dispatcher);
    },
  };
  const Sink: React.FC = () => <UndoToastSink store={store} />;
  Sink.displayName = 'CirUndoToastSink';
  return { emitter, Sink };
}

interface UndoToastSinkProps {
  store: ToastSinkStore;
}

function UndoToastSink({ store }: UndoToastSinkProps): React.ReactElement | null {
  const active = useSyncExternalStore(
    (l) => store.subscribe(l),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
  if (active.length === 0) return null;
  return (
    <div
      data-cir-undo-toast-sink="true"
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: '8px',
        zIndex: 60,
      }}
    >
      {active.map(({ id, notice, handle, startedAt }) => (
        <UndoToastItem
          key={id}
          notice={notice}
          handle={handle}
          startedAt={startedAt}
          onClose={() => {
            store.remove(id);
          }}
        />
      ))}
    </div>
  );
}

interface UndoToastItemProps {
  notice: UndoToastNotice;
  handle: UndoHandle;
  startedAt: number;
  onClose: () => void;
}

/**
 * Inline undo toast — message + Undo button + dismiss + countdown bar.
 * Visual mirror of `<Toast variant="undo">` from `@atelier/components` but
 * without the dep. Hosts that want the canonical look swap their own
 * sink in by calling `withUndo()` with a custom emitter.
 */
function UndoToastItem({
  notice,
  handle,
  startedAt,
  onClose,
}: UndoToastItemProps): React.ReactElement {
  const [remainingMs, setRemainingMs] = useState<number>(notice.windowMs);
  const dismissedRef = useRef<boolean>(false);

  useEffect(() => {
    const tick = (): void => {
      const elapsed = Date.now() - startedAt;
      const next = Math.max(0, notice.windowMs - elapsed);
      setRemainingMs(next);
      if (next <= 0 && !dismissedRef.current) {
        dismissedRef.current = true;
        // Window-expiry path — the dispatcher's own timer already fires
        // `action.undo_window_expired`. The sink just clears its UI.
        onClose();
      }
    };
    const interval = setInterval(tick, 100);
    return (): void => {
      clearInterval(interval);
    };
  }, [startedAt, notice.windowMs, onClose]);

  const pct =
    notice.windowMs > 0 ? Math.max(0, Math.min(100, (remainingMs / notice.windowMs) * 100)) : 0;
  const seconds = Math.round(notice.windowMs / 1000);
  const message = `${notice.actionId} — undo within ${String(seconds)}s`;

  return (
    <output
      role="status"
      aria-live="polite"
      data-cir-component="Toast"
      data-variant="undo"
      data-severity="undo"
      data-cir-undo-toast-item="true"
      className="bg-gray-900 text-white border border-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-300 rounded-md shadow-lg flex flex-col overflow-hidden"
      style={{ minWidth: '280px' }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex-1 text-sm">{message}</span>
        <button
          type="button"
          data-cir-undo-button="true"
          onClick={() => {
            if (dismissedRef.current) return;
            dismissedRef.current = true;
            void handle.undo();
            onClose();
          }}
          className="text-sm font-medium underline underline-offset-2 hover:no-underline"
        >
          Undo
        </button>
        <button
          type="button"
          data-cir-dismiss-button="true"
          aria-label="Dismiss"
          onClick={() => {
            if (dismissedRef.current) return;
            dismissedRef.current = true;
            handle.dismiss();
            onClose();
          }}
          className="text-sm opacity-70 hover:opacity-100"
        >
          ×
        </button>
      </div>
      <div
        data-cir-undo-progress="true"
        aria-hidden="true"
        className="h-1 bg-white/10 dark:bg-black/10"
      >
        <div
          className="h-full bg-white/60 dark:bg-black/60 transition-[width] duration-100 ease-linear"
          style={{ width: `${String(pct)}%` }}
        />
      </div>
    </output>
  );
}
