// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPersistedBool, writePersistedBool } from '../../src/lib/persisted-state.js';

describe('persisted-state', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a boolean via write then read', () => {
    writePersistedBool('cir.test.k', true);
    expect(readPersistedBool('cir.test.k', false)).toBe(true);
    writePersistedBool('cir.test.k', false);
    expect(readPersistedBool('cir.test.k', true)).toBe(false);
  });

  it('returns the fallback when the key is absent', () => {
    expect(readPersistedBool('cir.test.missing', true)).toBe(true);
    expect(readPersistedBool('cir.test.missing', false)).toBe(false);
  });

  it('returns the fallback when the stored value is corrupt', () => {
    window.localStorage.setItem('cir.test.corrupt', 'yes');
    expect(readPersistedBool('cir.test.corrupt', false)).toBe(false);
    window.localStorage.setItem('cir.test.corrupt-2', '');
    expect(readPersistedBool('cir.test.corrupt-2', true)).toBe(true);
    window.localStorage.setItem('cir.test.corrupt-3', 'true');
    // We deliberately use the literal '1' / '0' shape — anything else
    // (including stringified booleans) falls through.
    expect(readPersistedBool('cir.test.corrupt-3', false)).toBe(false);
  });

  it('does not throw when window is undefined', () => {
    const originalWindow = globalThis.window as unknown;
    // Force the SSR branch.
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true });
    try {
      expect(readPersistedBool('cir.test.ssr', true)).toBe(true);
      expect(() => {
        writePersistedBool('cir.test.ssr', true);
      }).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
      });
    }
  });

  it('keeps multiple keys independent', () => {
    writePersistedBool('cir.test.a', true);
    writePersistedBool('cir.test.b', false);
    writePersistedBool('cir.test.c', true);
    expect(readPersistedBool('cir.test.a', false)).toBe(true);
    expect(readPersistedBool('cir.test.b', true)).toBe(false);
    expect(readPersistedBool('cir.test.c', false)).toBe(true);
  });

  it('falls back gracefully when localStorage.getItem throws', () => {
    const originalGet = window.localStorage.getItem.bind(window.localStorage);
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      expect(readPersistedBool('cir.test.boom', true)).toBe(true);
    } finally {
      spy.mockRestore();
      // Sanity-check the restore landed by reading a fresh key with the
      // real implementation.
      expect(originalGet('cir.test.never-set')).toBeNull();
    }
  });

  it('silently no-ops when localStorage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(() => {
        writePersistedBool('cir.test.quota', true);
      }).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
