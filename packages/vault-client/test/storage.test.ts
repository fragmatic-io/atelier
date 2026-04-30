// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import {
  BrowserTokenStorage,
  DEFAULT_TOKEN_STORAGE_KEY,
  MemoryTokenStorage,
  defaultTokenStorage,
} from '../src/storage.js';

describe('MemoryTokenStorage', () => {
  it('round-trips a token', () => {
    const s = new MemoryTokenStorage();
    expect(s.read()).toBeNull();
    s.write('abc');
    expect(s.read()).toBe('abc');
    s.clear();
    expect(s.read()).toBeNull();
  });
});

describe('BrowserTokenStorage', () => {
  it('returns null when window is undefined (SSR)', () => {
    // In the default vitest node env, `window` is undefined.
    expect(typeof window).toBe('undefined');
    const s = new BrowserTokenStorage();
    expect(s.read()).toBeNull();
    // write + clear are no-ops in this env, but should not throw.
    expect(() => {
      s.write('x');
    }).not.toThrow();
    expect(() => {
      s.clear();
    }).not.toThrow();
  });

  it('uses the configured key when provided', () => {
    const s = new BrowserTokenStorage('cir.test.token');
    expect(s.read()).toBeNull();
  });

  it('exposes the default key as a constant', () => {
    expect(DEFAULT_TOKEN_STORAGE_KEY).toBe('cir.vault.token');
  });
});

describe('defaultTokenStorage', () => {
  it('returns a MemoryTokenStorage in Node', () => {
    const s = defaultTokenStorage();
    expect(s).toBeInstanceOf(MemoryTokenStorage);
  });
});
