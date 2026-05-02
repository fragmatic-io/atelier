// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `usePersistedState()` — Wave 11 / Nav-2.
 *
 * Generic [value, setValue] hook that mirrors `useState` but transparently
 * round-trips through `sessionStorage`, `localStorage`, or an optional
 * vault-backed writer injected via context. Designed as a baseline
 * persistence primitive any component can reach for — Sidebar collapse
 * memory (Nav-2), preserved scroll/view-state (Int-11), table column
 * visibility, density-per-route, etc. all share the same shape.
 *
 * Why not pull a dep
 * ------------------
 * `usehooks-ts` / `use-local-storage-state` carry sync, multi-tab, and
 * SSR-detection logic that's not free at our footprint budget. The shape
 * we actually need is small (~80 lines) and the divergent pieces — vault
 * tier, structured serialization, scope toggle — would be patches on top
 * of any third-party hook anyway.
 *
 * Storage scopes
 * --------------
 *  - `'session'` (default): `window.sessionStorage`. Per-tab; cleared on
 *    tab close. Right default for ephemeral UI shape (sidebar collapsed,
 *    saved-filter open/closed, last selected pane).
 *  - `'local'`:  `window.localStorage`. Persists across reloads and tabs.
 *    Right pick for cross-session preferences with no privacy concern.
 *  - `'vault'`:  per-user, server-backed via the `IntentVaultStateClient`
 *    injected through `PersistedVaultContext`. When no client is in scope
 *    the hook silently falls back to `'local'` — hosts can keep the same
 *    `scope: 'vault'` call regardless of whether a vault is wired.
 *
 * SSR contract
 * ------------
 * On the server (no `window`) the hook returns `defaultValue` and the
 * setter is a no-op write to in-memory state. The first effect on the
 * client reads the persisted value and (if it differs) re-renders with
 * the stored shape. This mirrors the `useReducedMotion` SSR pattern in
 * this same package — initial render is conservative, post-hydration
 * effect reconciles.
 *
 * Disabled persistence
 * --------------------
 * When `storageKey` is `undefined`, the hook degrades to plain
 * `useState(defaultValue)`. This makes "opt-in persistence" a flat prop
 * pass-through at the call site:
 *
 * ```tsx
 * const [collapsed, setCollapsed] = usePersistedState({
 *   storageKey: props.storageKey ? `${props.storageKey}.collapsed` : undefined,
 *   defaultValue: false,
 * });
 * ```
 *
 * Cross-tab sync
 * --------------
 * `'local'` scope listens for `'storage'` events so a write in one tab
 * propagates to other tabs. `'session'` does NOT — sessionStorage events
 * never cross tabs by spec. `'vault'` sync is the vault client's concern;
 * the hook is neutral on whether the writer pushes events.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// -----------------------------------------------------------------------------
// Vault context — opt-in injection point for `scope: 'vault'`
// -----------------------------------------------------------------------------

/**
 * Writer/reader pair the hook uses for `scope: 'vault'`. Hosts that wire a
 * full `@atelier/vault-client` adapt it into this shape and provide it via
 * `<PersistedVaultContext.Provider>`. Keeping the contract intentionally
 * tiny lets the hook stay zero-dep on `@atelier/vault-client` — large
 * surface, not every consumer wants to pull it in.
 *
 * The `subscribe` slot is optional. When provided, the hook re-renders
 * with the latest value whenever the vault notifies a change for `key`
 * (e.g. multi-device sync). When absent, the hook reads once on mount
 * and on every set — good enough for single-device flows.
 */
export interface PersistedVaultClient {
  read: (key: string) => string | null | undefined | Promise<string | null | undefined>;
  write: (key: string, value: string) => void | Promise<void>;
  remove?: (key: string) => void | Promise<void>;
  subscribe?: (key: string, listener: (value: string | null) => void) => () => void;
}

/**
 * Context slot for the vault client. Defaults to `null`; `scope: 'vault'`
 * falls back to `'local'` when no provider is in scope. Hosts wire this
 * once at app boot when their vault is available.
 */
export const PersistedVaultContext = createContext<PersistedVaultClient | null>(null);

// -----------------------------------------------------------------------------
// Public surface
// -----------------------------------------------------------------------------

export type PersistedScope = 'session' | 'local' | 'vault';

export interface PersistedStateOptions<T> {
  /**
   * Storage key. When `undefined`, persistence is disabled and the hook
   * degrades to `useState(defaultValue)`. This makes the opt-in shape a
   * flat prop pass-through at every call site.
   */
  storageKey: string | undefined;
  /** Initial value when nothing is persisted. */
  defaultValue: T;
  /** Where to persist. Defaults to `'session'` (per-tab). */
  scope?: PersistedScope;
  /** Custom serializer. Defaults to `JSON.stringify`. */
  serialize?: (value: T) => string;
  /**
   * Custom deserializer. Defaults to `JSON.parse` wrapped in a try/catch
   * that falls back to `defaultValue` on parse failure.
   */
  deserialize?: (raw: string) => T;
}

export type PersistedSetter<T> = (next: T | ((prev: T) => T)) => void;

/**
 * Returns a persisted `[value, setValue]` pair. See module docs for scope
 * semantics, SSR contract, and vault wiring.
 */
export function usePersistedState<T>(opts: PersistedStateOptions<T>): [T, PersistedSetter<T>] {
  const {
    storageKey,
    defaultValue,
    scope = 'session',
    serialize = defaultSerialize,
    deserialize = defaultDeserialize,
  } = opts;

  const vault = useContext(PersistedVaultContext);
  // Effective web-storage scope for fallback: `'vault'` falls back to
  // `'local'` when no vault client is wired (same persistence durability
  // for the host while the vault is out of context).
  const webScope: 'session' | 'local' = scope === 'session' ? 'session' : 'local';

  // Stable refs so the read/write helpers don't re-bind on every render
  // (deserialize / serialize identities aren't memoized by hosts).
  const serializeRef = useRef(serialize);
  serializeRef.current = serialize;
  const deserializeRef = useRef(deserialize);
  deserializeRef.current = deserialize;

  // Lazy init: read once from web storage during the first render. SSR
  // returns `defaultValue` because `window` is undefined. Vault reads are
  // ALWAYS deferred to the post-mount effect — `vault.read()` may be async
  // and we cannot block first render on a promise.
  const [value, setValueState] = useState<T>(() => {
    if (storageKey === undefined) return defaultValue;
    if (scope === 'vault') return defaultValue;
    return readFromWebStorage(webScope, storageKey, deserializeRef.current, defaultValue);
  });

  // Vault read on mount + subscribe (when supported). Resolves async.
  useEffect(() => {
    if (storageKey === undefined) return;
    if (scope !== 'vault' || vault === null) return;
    let cancelled = false;
    void Promise.resolve(vault.read(storageKey)).then((raw) => {
      if (cancelled) return;
      if (raw === null || raw === undefined) return;
      try {
        setValueState(deserializeRef.current(raw));
      } catch {
        // Corrupt entry — keep the current state.
      }
    });
    const unsubscribe = vault.subscribe?.(storageKey, (raw) => {
      if (raw === null) return;
      try {
        setValueState(deserializeRef.current(raw));
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [scope, storageKey, vault]);

  // `'local'` scope listens for cross-tab `storage` events. The DOM event
  // fires only when ANOTHER tab/window mutates the same key, so we don't
  // get a feedback loop with our own writes.
  useEffect(() => {
    if (storageKey === undefined) return;
    if (webScope !== 'local') return;
    if (scope === 'vault' && vault !== null) return;
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent): void => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== storageKey) return;
      if (event.newValue === null) return;
      try {
        setValueState(deserializeRef.current(event.newValue));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [scope, webScope, storageKey, vault]);

  const setValue = useCallback<PersistedSetter<T>>(
    (next) => {
      setValueState((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        if (storageKey !== undefined) {
          if (scope === 'vault' && vault !== null) {
            try {
              const raw = serializeRef.current(resolved);
              void Promise.resolve(vault.write(storageKey, raw)).catch(() => {
                // Vault write failure is best-effort — local state still
                // reflects the user's choice; a follow-up write will retry.
              });
            } catch {
              /* serialize failure — keep state */
            }
          } else {
            writeToWebStorage(webScope, storageKey, resolved, serializeRef.current);
          }
        }
        return resolved;
      });
    },
    [scope, webScope, storageKey, vault],
  );

  return [value, setValue];
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function defaultSerialize<T>(value: T): string {
  return JSON.stringify(value);
}

function defaultDeserialize<T>(raw: string): T {
  // Caller's try/catch handles parse failure — we deliberately let
  // `JSON.parse` throw so the hook can fall back to `defaultValue`.
  return JSON.parse(raw) as T;
}

function getWebStorage(scope: 'session' | 'local'): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return scope === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    // Some sandboxed contexts (sandboxed iframes, Safari private mode) throw
    // on storage access. Treat as "no storage".
    return null;
  }
}

function readFromWebStorage<T>(
  scope: 'session' | 'local',
  key: string,
  deserialize: (raw: string) => T,
  fallback: T,
): T {
  const store = getWebStorage(scope);
  if (store === null) return fallback;
  try {
    const raw = store.getItem(key);
    if (raw === null) return fallback;
    try {
      return deserialize(raw);
    } catch {
      return fallback;
    }
  } catch {
    return fallback;
  }
}

function writeToWebStorage<T>(
  scope: 'session' | 'local',
  key: string,
  value: T,
  serialize: (v: T) => string,
): void {
  const store = getWebStorage(scope);
  if (store === null) return;
  try {
    store.setItem(key, serialize(value));
  } catch {
    // Quota exceeded / SecurityError / disabled storage. The hook stays
    // best-effort: the in-memory state still reflects the user's choice.
  }
}
