// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Token-storage adapter contract + the two default implementations.
 *
 * Hosts plug in their own storage when they need cookies or a more secure
 * keystore. The interface is intentionally tiny:
 *
 *   read()    → string | null   (the persisted token, or null)
 *   write(t)  → void            (overwrite the slot)
 *   clear()   → void            (drop the slot, e.g. on revoke)
 *
 * SSR safety: the `BrowserTokenStorage` wraps `localStorage` in
 * `typeof window !== 'undefined'` guards so importing the module on the
 * server doesn't blow up.
 */

export interface VaultTokenStorage {
  read(): string | null;
  write(token: string): void;
  clear(): void;
}

/** Default key used when none is provided. Namespaced for unambiguous DevTools display. */
export const DEFAULT_TOKEN_STORAGE_KEY = 'cir.vault.token';

/**
 * Browser localStorage adapter. SSR-safe: every method returns a no-op /
 * null when `window` is undefined or `localStorage` access throws (some
 * environments — `file://`, privacy modes — refuse access).
 */
export class BrowserTokenStorage implements VaultTokenStorage {
  private readonly key: string;

  constructor(key: string = DEFAULT_TOKEN_STORAGE_KEY) {
    this.key = key;
  }

  read(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(this.key);
    } catch {
      return null;
    }
  }

  write(token: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(this.key, token);
    } catch {
      // Quota exceeded, privacy mode, etc. — caller can re-mint on demand.
    }
  }

  clear(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(this.key);
    } catch {
      // Same fall-through as `write`.
    }
  }
}

/**
 * In-memory adapter. Used in Node, in tests, and as the default when the
 * caller doesn't pass one (so the client works the same way in either env).
 */
export class MemoryTokenStorage implements VaultTokenStorage {
  private value: string | null = null;

  read(): string | null {
    return this.value;
  }

  write(token: string): void {
    this.value = token;
  }

  clear(): void {
    this.value = null;
  }
}

/**
 * Auto-detect the right storage:
 *   - In a browser (`typeof window !== 'undefined'`), use localStorage.
 *   - In Node, use in-memory.
 */
export function defaultTokenStorage(): VaultTokenStorage {
  if (typeof window !== 'undefined') return new BrowserTokenStorage();
  return new MemoryTokenStorage();
}
