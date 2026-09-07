// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Browser-test compatibility for Node versions that expose Web Storage on the
 * process global without configuring a backing file.
 *
 * Node 26 defines `globalThis.localStorage` and `sessionStorage`, but returns
 * `undefined` when no `--localstorage-file` is present. Vitest 2.1 sees those
 * property names and therefore does not copy Happy DOM's in-memory storage
 * instances onto the test global. Browser tests then fail before they can run.
 *
 * Keep this deliberately narrow: Node-only tests never have `window`, real
 * browser storage is retained, and only a missing Happy DOM storage instance
 * is replaced.
 */
export {};

if (typeof window !== 'undefined') {
  const missingLocalStorage = window.localStorage === undefined;
  const missingSessionStorage = window.sessionStorage === undefined;

  if (missingLocalStorage || missingSessionStorage) {
    const { Storage } = await import('happy-dom');

    if (missingLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: new Storage(),
        configurable: true,
        enumerable: true,
        writable: false,
      });
    }

    if (missingSessionStorage) {
      Object.defineProperty(globalThis, 'sessionStorage', {
        value: new Storage(),
        configurable: true,
        enumerable: true,
        writable: false,
      });
    }
  }
}
