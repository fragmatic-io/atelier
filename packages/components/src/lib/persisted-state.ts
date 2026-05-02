// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `persisted-state` — tiny SSR-safe helpers for stashing small bits of
 * UI state in `localStorage`. Wave 7b lands this for `<Sidebar>`'s
 * collapse-state memory; future tracks (Wave 7c+ tree expansion, table
 * column visibility, density preference, etc.) reuse the same shape.
 *
 * Why not pull a dep:
 *  - `usehooks-ts` / `use-local-storage-state` would carry context, sync,
 *    and SSR-detection logic we do not need. Sidebar persistence is a
 *    flat boolean per key — a 30-line helper covers it without locking
 *    callers into a hook contract.
 *
 * Storage shape: each key holds the literal string `'1'` (true) or
 * `'0'` (false). Anything else falls through to `fallback`. The string
 * shape (rather than `JSON.stringify(true)`) keeps stored values
 * grep-able in browser devtools and avoids accidental schema drift if a
 * future helper layers richer state on top — those helpers should live
 * alongside this file with their own `read*` / `write*` pair.
 *
 * SSR: every call is wrapped in `typeof window` + `try/catch`, so
 * importing this module from a server-rendered component is safe.
 * Quota errors, disabled storage (private browsing on iOS Safari pre-11),
 * and `SecurityError` from cross-origin iframes all degrade silently.
 */

/**
 * Read a boolean from `localStorage[key]`. Returns `fallback` when:
 *  - `window` / `localStorage` is unavailable (SSR, sandbox).
 *  - The key is absent.
 *  - The stored value is anything other than `'1'` or `'0'`.
 *  - The storage access itself throws (quota, security, etc.).
 */
export function readPersistedBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const ls = window.localStorage;
    if (ls === null || ls === undefined) return fallback;
    const raw = ls.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write a boolean to `localStorage[key]` as `'1'` (true) or `'0'`
 * (false). Silent no-op when storage is unavailable or throws.
 */
export function writePersistedBool(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const ls = window.localStorage;
    if (ls === null || ls === undefined) return;
    ls.setItem(key, value ? '1' : '0');
  } catch {
    // Quota / SecurityError / disabled storage — nothing useful to do.
  }
}

/**
 * Wave 11 / Nav-2 — read a JSON-encoded value from `localStorage[key]`,
 * falling back to `fallback` when the key is absent, the value is corrupt,
 * or storage is unavailable.
 *
 * Used by `<Sidebar storageKey>` to persist the per-node expanded set as
 * an array of ids (`["docs","settings"]`). Kept as plain JSON rather than
 * a custom encoding so devtools surface the value legibly and so future
 * helpers in this file (table column visibility, density-per-route) can
 * share the same shape without inventing a parser.
 *
 * Why two helpers
 * ---------------
 * `readPersistedBool` / `writePersistedBool` ship a hand-encoded
 * `'1'`/`'0'` shape (smaller, devtools-grep-friendly). For richer payloads
 * the `'1'`/`'0'` trick stops working, so this pair adds a JSON-typed
 * round-trip while keeping every component in `@atelier/components`
 * decoupled from `@atelier/react`'s `usePersistedState` hook (which is
 * the host-facing surface for the same concern). Hosts that want
 * cross-tab sync, vault tier, or session/local toggle reach for the
 * `@atelier/react` hook; baseline components reach for these helpers.
 */
export function readPersistedJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const ls = window.localStorage;
    if (ls === null || ls === undefined) return fallback;
    const raw = ls.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  } catch {
    return fallback;
  }
}

/**
 * Write a JSON-encoded value to `localStorage[key]`. Silent no-op when
 * storage is unavailable or throws (quota, SecurityError, disabled
 * storage in Safari private mode).
 */
export function writePersistedJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    const ls = window.localStorage;
    if (ls === null || ls === undefined) return;
    ls.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / SecurityError / disabled storage — nothing useful to do.
  }
}
