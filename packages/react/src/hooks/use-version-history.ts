// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useVersionHistory()` — Wave 11 / Cnt-11.
 *
 * Notion / Coda style per-doc version history. Pairs naturally with
 * `useAutosave({ value, save, onSaved })` — call `commit()` from
 * `onSaved` and every persisted save lands a snapshot in history.
 *
 * Why a separate hook (instead of folding into `useAutosave`)?
 * -----------------------------------------------------------
 * Some surfaces want autosave WITHOUT history (inline-edit cells),
 * some want history WITHOUT autosave (manual "Save version" buttons),
 * and some want both. Splitting them keeps each concern sharp and lets
 * hosts compose freely. The two are intentionally orthogonal.
 *
 * Storage
 * -------
 * Versions persist via Nav-2's `usePersistedState` so scope (`'session'`
 * / `'local'`) is consistent with the rest of the persistence layer.
 * Each version carries an `id`, a `createdAt` wall-clock timestamp, the
 * snapshotted `value` (deep-copied at commit time via JSON round-trip
 * so mutations to the live value don't leak back into history), and an
 * optional `note` the host can surface in a timeline UI.
 *
 * Cap + eviction
 * --------------
 * `maxVersions` defaults to 50 — enough for an afternoon of edits without
 * unbounded localStorage growth. When the cap is hit, the OLDEST entry
 * is evicted (FIFO) — newer history is more relevant for "I broke the
 * doc 30 seconds ago, restore it" recovery flows. Hosts wanting an
 * "important version" pin reach above the hook (a separate sticky list).
 *
 * Structural-equality skip
 * ------------------------
 * `commit()` is a no-op when the current value is structurally equal to
 * the last snapshot. This prevents history bloat from hosts that call
 * `commit()` after every autosave settle — long stretches of typing
 * collapse to a single "session" version, not one per keystroke.
 */

import { useCallback, useMemo, useRef } from 'react';
import { usePersistedState } from './use-persisted-state.js';

export interface VersionEntry<T> {
  /** Stable id for `restore()`. Generated on commit. */
  id: string;
  /** Wall-clock timestamp (`Date.now()`) at commit time. */
  createdAt: number;
  /** Deep-copied snapshot of the value at commit time. */
  value: T;
  /** Optional note from the caller (e.g. "Auto-saved" / "Before refactor"). */
  note?: string;
}

export interface UseVersionHistoryOptions<T> {
  /**
   * `usePersistedState` storage key. The hook composes on top of Nav-2,
   * so any key shape that hook accepts works here. Pass `undefined` to
   * disable persistence (history lives in-memory only — useful for tests
   * and ephemeral surfaces).
   */
  storageKey: string | undefined;
  /**
   * Current value. Only snapshotted on `commit()`; the hook does NOT
   * auto-commit on change (history would otherwise grow per-keystroke).
   * Hosts pair with `useAutosave` and call `commit()` from `onSaved`.
   */
  value: T;
  /** Cap on retained versions. Defaults to 50. Oldest is evicted first. */
  maxVersions?: number;
  /** Persistence scope passed through to `usePersistedState`. */
  scope?: 'session' | 'local';
}

export interface UseVersionHistoryResult<T> {
  /** Versions in chronological order — oldest first, newest last. */
  versions: ReadonlyArray<VersionEntry<T>>;
  /**
   * Snapshot the current value into a new version. No-op when the value
   * is structurally equal to the last snapshot. The optional `note` is
   * stored verbatim for host-rendered timeline labels.
   */
  commit: (note?: string) => void;
  /**
   * Look up the snapshotted value for a version id. Returns `undefined`
   * when the id is unknown. The hook does NOT mutate the host's live
   * value — restoration is the host's concern (it typically calls a
   * setter with the returned snapshot, then re-saves).
   */
  restore: (versionId: string) => T | undefined;
  /** Drop all versions. */
  clear: () => void;
}

const DEFAULT_MAX_VERSIONS = 50;

/**
 * Returns version history state + mutators. See module docs for storage,
 * cap, and equality semantics.
 */
export function useVersionHistory<T>(
  opts: UseVersionHistoryOptions<T>,
): UseVersionHistoryResult<T> {
  const { storageKey, value, maxVersions = DEFAULT_MAX_VERSIONS, scope = 'local' } = opts;

  const persistedOpts: Parameters<typeof usePersistedState<ReadonlyArray<VersionEntry<T>>>>[0] = {
    storageKey,
    defaultValue: [] as ReadonlyArray<VersionEntry<T>>,
    scope,
  };
  const [versions, setVersions] = usePersistedState<ReadonlyArray<VersionEntry<T>>>(persistedOpts);

  // Latest value tracked by ref so `commit()` always snapshots the value
  // at the moment of the call, regardless of when its identity was
  // captured by a parent's render loop.
  const valueRef = useRef<T>(value);
  valueRef.current = value;

  // Latest cap, similarly tracked — hosts may bump `maxVersions` mid-
  // session (e.g. when they detect an "expert mode" setting).
  const maxRef = useRef<number>(maxVersions);
  maxRef.current = maxVersions;

  const commit = useCallback(
    (note?: string): void => {
      const snapshot = deepCopy(valueRef.current);
      const serialized = serialize(snapshot);
      setVersions((prev) => {
        // Structural skip — the most-recent entry is the tail.
        const last = prev[prev.length - 1];
        if (last !== undefined && serialize(last.value) === serialized) {
          return prev;
        }
        const entry: VersionEntry<T> = {
          id: generateId(),
          createdAt: Date.now(),
          value: snapshot,
        };
        if (note !== undefined) entry.note = note;
        const next = [...prev, entry];
        const cap = Math.max(1, maxRef.current);
        if (next.length > cap) {
          // FIFO eviction — drop oldest entries until we're at the cap.
          return next.slice(next.length - cap);
        }
        return next;
      });
    },
    [setVersions],
  );

  const restore = useCallback(
    (versionId: string): T | undefined => {
      const entry = versions.find((v) => v.id === versionId);
      if (entry === undefined) return undefined;
      // Hand back a fresh copy so mutations on the returned value don't
      // corrupt the snapshot in history.
      return deepCopy(entry.value);
    },
    [versions],
  );

  const clear = useCallback((): void => {
    setVersions([]);
  }, [setVersions]);

  return useMemo<UseVersionHistoryResult<T>>(
    () => ({ versions, commit, restore, clear }),
    [versions, commit, restore, clear],
  );
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function serialize<T>(value: T): string {
  try {
    return JSON.stringify(value) ?? 'undefined';
  } catch {
    return `__nonserializable_${Math.random()}`;
  }
}

function deepCopy<T>(value: T): T {
  // JSON round-trip is the cheapest deep copy for the JSON-shaped values
  // forms / docs use. Non-serializable values fall through to a
  // structural clone via the platform's `structuredClone` (when
  // available) and finally to the original reference.
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch {
        /* fall through */
      }
    }
    return value;
  }
}

function generateId(): string {
  // Crypto-strong when available (browsers + modern Node), best-effort
  // random otherwise. The id only needs to be unique within the cap, so
  // collision risk is negligible.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID !== undefined) return c.randomUUID();
  return `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
