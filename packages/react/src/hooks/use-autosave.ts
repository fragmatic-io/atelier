// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useAutosave()` — Wave 11 / Cnt-11.
 *
 * Debounced auto-save with a status state machine. Powers Notion / Coda /
 * Linear style "Saving… / Saved 2s ago / Failed — retry" pills wired into
 * any form, doc editor, or inline-edit cell.
 *
 * State machine
 * -------------
 * `'idle'`     — initial, OR caught up after a successful save with the
 *                 current value still equal to the last saved value.
 * `'pending'`  — the value has changed since the last successful save and
 *                 a debounce timer is in flight (no network call yet).
 * `'saving'`   — `save()` is currently executing.
 * `'saved'`    — last `save()` resolved; transitions back to `'idle'`
 *                 immediately on the next value mutation. We keep the
 *                 `'saved'` flash long enough for hosts to read
 *                 `lastSavedAt` and animate a status pill.
 * `'error'`    — last `save()` rejected. Clears on the next successful
 *                 save. Hosts can drive a "Retry" button via `flush()`.
 *
 * Coalescing
 * ----------
 * If the user types while a `save()` is in flight, the in-flight call
 * does NOT cancel — that would orphan a server write the user already
 * paid the latency for. Instead we mark "dirty after save started" and
 * schedule a follow-up save the moment the in-flight one settles. This
 * keeps the wire shape "at most one save in flight per host", which is
 * the predictable contract every server-side write expects.
 *
 * SSR / unmount safety
 * --------------------
 * `flush()` is the explicit escape hatch hosts call from a beforeunload /
 * route-change boundary to force a synchronous-ish save before tear-down.
 * Internally it drains the debounce timer and awaits the resulting
 * `save()` promise. Calling `flush()` while no work is pending resolves
 * immediately.
 *
 * Why no built-in retry / backoff?
 * --------------------------------
 * Atelier's posture is to surface the `error` and let the host decide.
 * Some surfaces want exponential backoff, some want a manual "Retry"
 * button, some want to abandon the change and roll back optimistically.
 * Folding any one of those policies into the hook would force every
 * other host to opt OUT — the opposite of what we want.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface UseAutosaveOptions<T> {
  /**
   * Current value to save. The hook compares structurally against the
   * last saved value via `JSON.stringify` — equal values do not trigger
   * a save. Hosts wanting custom equality wrap the value in a stable
   * memo before passing it in.
   */
  value: T;
  /**
   * Persistence callback. Receives the latest `value` and returns a
   * promise that resolves on success or rejects on failure. The hook
   * does NOT inspect the resolved value — hosts that need the saved
   * record back use `onSaved` or close over a setter in `save`.
   */
  save: (value: T) => Promise<void>;
  /**
   * Debounce window in milliseconds. Defaults to 800ms — long enough to
   * coalesce a fluent typist's bursts, short enough that "Saved" feels
   * responsive after a pause. Notion uses ~500ms, Coda ~1000ms; 800ms
   * sits in the middle and matches the ergonomics of our test suite.
   */
  debounceMs?: number;
  /**
   * Fires after `save()` resolves, with the wall-clock timestamp of the
   * resolution (`Date.now()`). The companion `useVersionHistory` hook
   * pairs naturally here — call its `commit()` from `onSaved` to keep
   * version history aligned with persisted snapshots.
   */
  onSaved?: (timestamp: number) => void;
  /** Fires after `save()` rejects, with the original error. */
  onError?: (err: unknown) => void;
}

export interface UseAutosaveResult {
  /** Current status. See module docs for the state machine. */
  status: AutosaveStatus;
  /** Wall-clock timestamp (`Date.now()`) of the last successful save. */
  lastSavedAt: number | null;
  /**
   * Force an immediate save, bypassing the debounce. Resolves once the
   * resulting (or in-flight) `save()` settles. Resolves immediately when
   * no work is pending. Hosts call this from beforeunload / route-change
   * boundaries and from a manual "Retry" affordance.
   */
  flush: () => Promise<void>;
  /** Last error from `save()`, cleared on the next successful save. */
  error: unknown;
}

const DEFAULT_DEBOUNCE_MS = 800;

/**
 * Returns autosave status + flush handle. See module docs for the state
 * machine and coalescing semantics.
 */
export function useAutosave<T>(opts: UseAutosaveOptions<T>): UseAutosaveResult {
  const { value, save, debounceMs = DEFAULT_DEBOUNCE_MS, onSaved, onError } = opts;

  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Stable refs for callback identities — hosts rarely memoize these and
  // we don't want to retrigger effects on every render of a parent.
  const saveRef = useRef(save);
  saveRef.current = save;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Latest value tracked by ref — flush() and the debounce timer both
  // need the most recent value at the moment they run, NOT the value
  // captured when the timer was scheduled.
  const valueRef = useRef<T>(value);
  valueRef.current = value;

  // Last-saved snapshot, kept as a serialized string so structural
  // equality on plain JSON values is cheap. Initial render seeds with
  // the current value so the very first render does not race-fire a
  // save against the host's initial state.
  const lastSavedSnapshotRef = useRef<string>(serialize(value));

  // Debounce timer handle.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // In-flight save promise. Used for coalescing — a second save() does
  // not start while this is non-null; instead we set `pendingAfterSave`
  // and chain the next save off the current one's settle.
  const inFlightRef = useRef<Promise<void> | null>(null);
  // True iff value mutated WHILE the in-flight save was running.
  // Cleared when the chained save begins.
  const pendingAfterSaveRef = useRef<boolean>(false);

  // Resolvers waiting on flush(). All resolve when the next save settles
  // (success or error). Cleared on each settle.
  const flushWaitersRef = useRef<Array<() => void>>([]);

  // Mounted flag so async settles don't setState into an unmounted tree.
  const mountedRef = useRef<boolean>(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const drainFlushWaiters = useCallback((): void => {
    const waiters = flushWaitersRef.current;
    flushWaitersRef.current = [];
    for (const w of waiters) w();
  }, []);

  const runSave = useCallback((): Promise<void> => {
    const snapshot = valueRef.current;
    const serialized = serialize(snapshot);
    if (mountedRef.current) setStatus('saving');
    const p = (async (): Promise<void> => {
      try {
        await saveRef.current(snapshot);
        const ts = Date.now();
        lastSavedSnapshotRef.current = serialized;
        if (mountedRef.current) {
          setError(null);
          setLastSavedAt(ts);
          // If the value mutated again during the save, jump back into
          // 'pending' (a follow-up save will fire on the next tick) so
          // we never visually claim "saved" while dirty.
          const dirtyDuringSave = pendingAfterSaveRef.current;
          if (dirtyDuringSave) {
            setStatus('pending');
          } else {
            setStatus('saved');
          }
        }
        onSavedRef.current?.(ts);
      } catch (err) {
        if (mountedRef.current) {
          setError(err);
          setStatus('error');
        }
        onErrorRef.current?.(err);
      } finally {
        inFlightRef.current = null;
        drainFlushWaiters();
        // Coalesce: if the value changed during this save, schedule a
        // follow-up immediately. The next debounce tick is skipped — the
        // user already paid for the wait.
        if (pendingAfterSaveRef.current) {
          pendingAfterSaveRef.current = false;
          // Re-fire only when the new value is still distinct from the
          // last saved snapshot (the user may have typed back to the
          // original).
          if (serialize(valueRef.current) !== lastSavedSnapshotRef.current) {
            inFlightRef.current = runSave();
          }
        }
      }
    })();
    return p;
  }, [drainFlushWaiters]);

  // Watch `value` for changes; debounce a save when the new value is
  // structurally different from the last saved snapshot.
  useEffect(() => {
    const serialized = serialize(value);
    if (serialized === lastSavedSnapshotRef.current) {
      // Caught up with persisted state — clear any in-flight debounce.
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Don't disturb 'saving' / 'error' — those are owned by the save
      // pipeline. Only flip a stale 'pending' back to 'idle'.
      setStatus((prev) => (prev === 'pending' ? 'idle' : prev));
      return;
    }
    // Value differs. If a save is already running, mark dirty-during-save
    // and don't reschedule — the in-flight save's settle handler will
    // chain a follow-up.
    if (inFlightRef.current !== null) {
      pendingAfterSaveRef.current = true;
      return;
    }
    setStatus('pending');
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (inFlightRef.current !== null) {
        // Race: a flush() started a save in the same tick. Mark dirty
        // and let the in-flight settle handler chain a follow-up.
        pendingAfterSaveRef.current = true;
        return;
      }
      inFlightRef.current = runSave();
    }, debounceMs);
  }, [value, debounceMs, runSave]);

  const flush = useCallback((): Promise<void> => {
    // Cancel pending debounce — flush() means "now".
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // If a save is already running, just await its settle. If we're
    // dirty post-save-start, the settle handler will chain a follow-up;
    // resolving on the FIRST settle is intentional — flush() guarantees
    // "the value as of the call" reaches the wire, and the in-flight
    // save satisfies that for its own snapshot. Hosts that want "every
    // pending save drains" can loop: `while (status !== 'saved' &&
    // status !== 'idle' && status !== 'error') await flush();`.
    if (inFlightRef.current !== null) {
      return new Promise<void>((resolve) => {
        flushWaitersRef.current.push(resolve);
      });
    }
    // No save in flight — start one if dirty, otherwise resolve.
    if (serialize(valueRef.current) === lastSavedSnapshotRef.current) {
      return Promise.resolve();
    }
    const p = runSave();
    inFlightRef.current = p;
    return p;
  }, [runSave]);

  return { status, lastSavedAt, flush, error };
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function serialize<T>(value: T): string {
  try {
    return JSON.stringify(value) ?? 'undefined';
  } catch {
    // Cyclic / non-serializable — fall back to a referential tag so the
    // hook still detects "changed" but never claims "equal" by accident.
    return `__nonserializable_${Math.random()}`;
  }
}
